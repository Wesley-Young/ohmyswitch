import { z } from 'zod';

import {
  type Choice,
  command,
  flag,
  group,
  type Scope,
  secret,
  select,
  text,
  textList,
} from '#cli/framework/command.ts';
import { CliError, toCliError } from '#cli/framework/errors.ts';
import { listing, plural, shellQuote } from '#cli/framework/text.ts';
import { parseWith } from '#cli/framework/validate.ts';
import type { Endpoint } from '#core/endpoints.ts';
import { baseUrl, iconUrl, providerName } from '#core/provider.ts';
import { createProviderInput, updateProviderInput } from '#core/providers/schemas.ts';
import {
  applicationStateLabels,
  endpointChoices,
  endpointDetails,
  endpointLabels,
  harnessIndex,
  modelChoice,
  modelStages,
  noProviders,
  type ProviderSummary,
  problemsOf,
  providerParam,
  refOf,
  warnProblems,
} from './shared.ts';

const modelId = z.string().trim().min(1).max(256);

const chosen = (scope: Scope) => scope.values.provider as ProviderSummary;

async function assertNameFree(scope: Scope, name: string, except?: string) {
  const ctx = await scope.services();
  if (ctx.providers.list().some((provider) => provider.name === name && provider.id !== except)) {
    throw new CliError('conflict', `A provider named "${name}" already exists`);
  }
}

const list = command({
  name: 'list',
  aliases: ['ls'],
  summary: 'List providers',
  params: {},
  async run(_values, scope) {
    const ctx = await scope.services();
    const harnesses = await harnessIndex(scope);
    return ctx.providers.list().map((provider) => ({
      ...provider,
      harnesses: provider.harnesses.map((id) => refOf(id, harnesses)),
    }));
  },
  render(providers, out) {
    if (!providers.length) {
      out.hint(noProviders);
      return;
    }
    out.table(
      ['NAME', 'ENDPOINT', 'MODELS', 'APPLIED TO'],
      providers.map((provider) => [
        provider.name,
        endpointLabels[provider.endpoint],
        String(provider.modelCount),
        provider.harnesses.map((harness) => harness.name).join(', ') || '-',
      ]),
    );
  },
});

const show = command({
  name: 'show',
  summary: 'Show a provider',
  params: {
    provider: providerParam(),
    showKey: flag({ summary: 'Include the API key' }),
  },
  async run({ provider, showKey }, scope) {
    const ctx = await scope.services();
    const harnesses = await harnessIndex(scope);
    const detail = ctx.providers.get(provider.id);
    const { iconUrl } = ctx.providers.connection(provider.id);
    const applications = (await ctx.harnesses.applications())[provider.id] ?? [];
    return {
      id: detail.id,
      name: detail.name,
      baseUrl: detail.baseUrl,
      endpoint: detail.endpoint,
      iconUrl: iconUrl || undefined,
      ...(showKey ? { apiKey: ctx.providers.connection(provider.id).apiKey } : {}),
      createdAt: detail.createdAt,
      harnesses: applications.map(({ harnessId, key, state }) => ({ ...refOf(harnessId, harnesses), key, state })),
      models: detail.effectiveModels,
    };
  },
  render(provider, out) {
    out.fields([
      ['Name', provider.name],
      ['ID', provider.id],
      ['Base URL', provider.baseUrl],
      ['Endpoint', `${endpointLabels[provider.endpoint]} (${provider.endpoint})`],
      ['Icon', provider.iconUrl],
      ['API key', provider.apiKey],
    ]);
    out.print();
    if (provider.harnesses.length) {
      out.table(
        ['APPLIED TO', 'KEY', 'STATE'],
        provider.harnesses.map((harness) => [harness.name, harness.key, applicationStateLabels[harness.state]]),
      );
    } else {
      out.hint(`Not applied to any harness. Apply it with "oms apply ${shellQuote(provider.name)}".`);
    }
    out.print();
    if (provider.models.length) {
      out.table(
        ['MODEL', 'CONTEXT', 'OUTPUT'],
        provider.models.map((model) => [
          model.id,
          model.contextWindow ? String(model.contextWindow) : '-',
          model.maxOutput ? String(model.maxOutput) : '-',
        ]),
      );
    } else {
      out.hint('No models.');
    }
  },
});

/** The connection typed so far while adding a provider. */
type DraftConnection = { baseUrl: string; endpoint: Endpoint; apiKey: string };

const draftKey = 'draft-models';

/** The models the provider being added serves, fetched once per run with the connection typed so far. */
function draftModels(scope: Scope) {
  return scope.memo(draftKey, async () => {
    const draft = scope.values as DraftConnection;
    const ctx = await scope.services();
    try {
      return await scope.progress((stage) => ctx.providers.listModels(draft, { onStage: modelStages(draft, stage) }));
    } catch (error) {
      throw new CliError('bad_gateway', `Could not list models: ${toCliError(error).message}`);
    }
  });
}

type DraftModels = Awaited<ReturnType<typeof draftModels>>;

const add = command({
  name: 'add',
  summary: 'Add a provider',
  params: {
    name: text({ summary: 'Name', placeholder: 'name', parse: (raw) => parseWith(providerName, raw) }),
    baseUrl: text({
      summary: 'Base URL',
      placeholder: 'url',
      hint: 'https://api.example.com',
      parse: (raw) => parseWith(baseUrl, raw),
    }),
    endpoint: select({
      summary: 'Endpoint',
      placeholder: 'endpoint',
      details: endpointDetails,
      choices: endpointChoices,
    }),
    apiKey: secret({ summary: 'API key', parse: (raw) => parseWith(createProviderInput.shape.apiKey, raw) }),
    allModels: flag({ summary: 'Fetch the models the provider serves and keep all of them' }),
    // Right after the key: fetching the list needs only the connection, and shows at once if the key is wrong.
    models: textList({
      summary: 'Models',
      flag: 'model',
      placeholder: 'id',
      details: 'By id, with details from models.dev; in a terminal, picked from the list the provider returns',
      optional: true,
      ask: (values) => !values.allModels,
      parse: (raw) => parseWith(modelId, raw),
      // Like the GUI's picker for a provider without models: everything starts ticked.
      async suggest(scope) {
        const { models } = await draftModels(scope);
        return { choices: models.map(modelChoice), ticked: models.map((model) => model.id), all: 'allModels' };
      },
    }),
    iconUrl: text({
      summary: 'Icon URL',
      placeholder: 'url',
      details: 'An image or a web page; by default the icon of the Base URL site',
      optional: true,
      parse: (raw) => parseWith(iconUrl, raw),
    }),
  },
  async run(values, scope) {
    if (values.allModels && values.models.length) {
      throw new CliError('usage', 'Pass either --model or --all-models', 'Run "oms provider add --help" for usage.');
    }
    await assertNameFree(scope, values.name);
    const ctx = await scope.services();
    // Models picked from the provider's list are saved with what the list says about them, and the list counts as
    // reviewed. Models given by id (or typed after the list failed) get their details from models.dev.
    let fetched: DraftModels | undefined;
    if (values.allModels) fetched = await draftModels(scope);
    else fetched = await scope.memoized<DraftModels>(draftKey)?.catch(() => undefined);
    const input = createProviderInput.parse({
      name: values.name,
      baseUrl: values.baseUrl,
      endpoint: values.endpoint,
      apiKey: values.apiKey,
      iconUrl: values.iconUrl,
      ...(fetched
        ? {
            listed: fetched.models,
            selected: values.allModels ? fetched.models.map((model) => model.id) : values.models,
          }
        : { modelIds: values.models }),
    });
    const provider = await scope.progress((stage) =>
      ctx.providers.create(input, { onStage: modelStages(input, stage) }),
    );
    return { ...provider, ...(fetched?.metadataError ? { metadataError: fetched.metadataError } : {}) };
  },
  render(provider, out) {
    out.success(`Added "${provider.name}" with ${plural(provider.modelCount, 'model')}.`);
    if ('metadataError' in provider) out.warn('models.dev could not be read, so some model details may be missing.');
    if (!provider.modelCount) {
      out.hint(
        `Some harnesses need at least one model. Choose them with "oms model pick ${shellQuote(provider.name)}".`,
      );
    }
    out.hint(`Apply it to harnesses with "oms apply ${shellQuote(provider.name)}".`);
  },
});

const edit = command({
  name: 'edit',
  summary: "Edit a provider's connection",
  params: {
    provider: providerParam(),
    name: text({
      summary: 'Name',
      placeholder: 'name',
      optional: true,
      initial: (scope) => chosen(scope).name,
      parse: (raw) => parseWith(providerName, raw),
    }),
    baseUrl: text({
      summary: 'Base URL',
      placeholder: 'url',
      optional: true,
      initial: (scope) => chosen(scope).baseUrl,
      parse: (raw) => parseWith(baseUrl, raw),
    }),
    endpoint: select({
      summary: 'Endpoint',
      placeholder: 'endpoint',
      details: endpointDetails,
      optional: true,
      initial: (scope) => chosen(scope).endpoint,
      choices: endpointChoices,
    }),
    apiKey: secret({
      summary: 'API key',
      optional: true,
      parse: (raw) => parseWith(updateProviderInput.shape.apiKey, raw),
    }),
    iconUrl: text({
      summary: 'Icon URL',
      placeholder: 'url',
      details: 'An empty value uses the icon of the Base URL site',
      optional: true,
      initial: async (scope) => (await scope.services()).providers.connection(chosen(scope).id).iconUrl,
      // An empty value is kept, as the way to clear the icon.
      parse: (raw) => (raw.trim() ? (parseWith(iconUrl, raw) ?? '') : ''),
    }),
  },
  async run({ provider, ...changes }, scope) {
    const ctx = await scope.services();
    if (Object.values(changes).every((value) => value === undefined)) {
      if (scope.session.interactive) return undefined;
      throw new CliError(
        'usage',
        'Nothing to change',
        'Pass --name, --base-url, --endpoint, --icon-url, --api-key-stdin or --api-key-env.',
      );
    }
    if (changes.name !== undefined) await assertNameFree(scope, changes.name, provider.id);
    const current = ctx.providers.connection(provider.id);
    const result = await ctx.providers.update(
      updateProviderInput.parse({
        providerId: provider.id,
        name: changes.name ?? current.name,
        baseUrl: changes.baseUrl ?? current.baseUrl,
        endpoint: changes.endpoint ?? current.endpoint,
        apiKey: changes.apiKey ?? current.apiKey,
        iconUrl: changes.iconUrl ?? current.iconUrl,
      }),
    );
    const harnesses = await harnessIndex(scope);
    const { harnessFailures, ...summary } = result;
    return {
      ...summary,
      harnesses: summary.harnesses.map((id) => refOf(id, harnesses)),
      failures: problemsOf(harnessFailures, harnesses),
    };
  },
  render(result, out) {
    if (!result) {
      out.hint('Nothing changed.');
      return;
    }
    out.success(`Saved "${result.name}".`);
    const written = result.harnesses.filter((harness) => !result.failures.some((item) => item.id === harness.id));
    if (written.length) out.hint(`Rewrote ${listing(written.map((harness) => harness.name))}.`);
    warnProblems(out, result.failures);
  },
  failed: (result) => Boolean(result?.failures.length),
});

const remove = command({
  name: 'remove',
  aliases: ['rm'],
  summary: 'Remove a provider',
  params: { provider: providerParam() },
  async confirm({ provider }, scope) {
    const harnesses = await harnessIndex(scope);
    const names = provider.harnesses.map((id) => refOf(id, harnesses).name);
    const also = names.length ? ` Its entries in ${listing(names)} will be removed too.` : '';
    return `Remove "${provider.name}"?${also}`;
  },
  async run({ provider }, scope) {
    const ctx = await scope.services();
    await ctx.providers.delete(provider.id);
    return { id: provider.id, name: provider.name };
  },
  render(provider, out) {
    out.success(`Removed "${provider.name}".`);
  },
});

/** Positions a provider can move to, counted in the list without it. */
async function positionChoices(scope: Scope): Promise<Choice<number>[]> {
  const ctx = await scope.services();
  const provider = chosen(scope);
  const providers = ctx.providers.list();
  const current = providers.findIndex((item) => item.id === provider.id);
  const others = providers.filter((item) => item.id !== provider.id);
  return providers.map((_, index) => {
    const before = others[index];
    const keys = [String(index + 1)];
    if (index === 0) keys.push('first');
    if (index === providers.length - 1) keys.push('last');
    return {
      value: index,
      keys,
      label: String(index + 1),
      hint: before ? `before ${before.name}` : 'at the end',
      disabled: index === current ? 'its current position' : undefined,
    };
  });
}

const move = command({
  name: 'move',
  summary: 'Move a provider in the list',
  params: {
    provider: providerParam(),
    to: select({
      summary: 'Position',
      placeholder: 'position',
      details: 'From 1, or first or last',
      empty: 'There is no other position to move it to.',
      choices: positionChoices,
    }),
  },
  async run({ provider, to }, scope) {
    const ctx = await scope.services();
    const ids = ctx.providers
      .list()
      .map((item) => item.id)
      .filter((id) => id !== provider.id);
    ids.splice(to, 0, provider.id);
    const { harnessFailures } = await ctx.providers.reorder({ providerIds: ids });
    const harnesses = await harnessIndex(scope);
    return { id: provider.id, name: provider.name, position: to + 1, failures: problemsOf(harnessFailures, harnesses) };
  },
  render(result, out) {
    out.success(`Moved "${result.name}" to position ${result.position}.`);
    warnProblems(out, result.failures);
  },
  failed: (result) => result.failures.length > 0,
});

export const provider = group({
  name: 'provider',
  aliases: ['providers'],
  summary: 'Manage providers',
  children: [list, show, add, edit, remove, move],
});
