import { type Choice, command, flag, group, type Scope, selectMany } from '#cli/framework/command.ts';
import { CliError, toCliError } from '#cli/framework/errors.ts';
import type { Output } from '#cli/framework/output.ts';
import { listing, plural, shellQuote } from '#cli/framework/text.ts';
import type { ModelInfo } from '#core/provider.ts';
import {
  harnessIndex,
  modelStages,
  type ProviderSummary,
  problemsOf,
  providerParam,
  refOf,
  warnProblems,
} from './shared.ts';

const chosen = (scope: Scope) => scope.values.provider as ProviderSummary;

/** Token counts the way the GUI writes them: 128K, 1M, 200K. */
export function formatTokens(tokens: number) {
  const unit = tokens % 1024 === 0 ? 1024 : 1000;
  const trim = (value: number) => String(Math.round(value * 10) / 10);
  if (tokens >= unit * unit) return `${trim(tokens / unit / unit)}M`;
  if (tokens >= unit) return `${trim(tokens / unit)}K`;
  return String(tokens);
}

/** What a model can do beyond plain text, in a few words. */
function features(model: ModelInfo) {
  const notes: string[] = [];
  if (model.reasoning) notes.push('reasoning');
  for (const input of model.input ?? []) if (input !== 'text') notes.push(input);
  if (model.toolCall === false) notes.push('no tool calls');
  return notes.join(', ');
}

const modelHint = (model: ModelInfo) =>
  [model.name, model.contextWindow && `${formatTokens(model.contextWindow)} context`].filter(Boolean).join(', ') ||
  undefined;

const modelChoice = (model: ModelInfo): Choice<string> => ({
  value: model.id,
  keys: [model.id],
  label: model.id,
  hint: modelHint(model),
});

function modelTable(out: Output, models: readonly ModelInfo[], marks?: (model: ModelInfo) => string) {
  out.table(
    ['MODEL', ...(marks ? ['SAVED'] : []), 'CONTEXT', 'OUTPUT', 'FEATURES'],
    models.map((model) => [
      model.id,
      ...(marks ? [marks(model)] : []),
      model.contextWindow ? formatTokens(model.contextWindow) : '-',
      model.maxOutput ? formatTokens(model.maxOutput) : '-',
      features(model) || '-',
    ]),
  );
}

/** The provider's models as it lists them now, fetched once per run and recorded as reviewed, like the GUI's picker. */
function fetched(scope: Scope) {
  const provider = chosen(scope);
  return scope.memo(`fetched:${provider.id}`, async () => {
    const ctx = await scope.services();
    try {
      return await scope.progress((stage) =>
        ctx.providers.fetchModels(provider.id, { onStage: modelStages(provider, stage) }),
      );
    } catch (error) {
      throw new CliError(
        'bad_gateway',
        `Could not list the models of "${provider.name}": ${toCliError(error).message}`,
      );
    }
  });
}

const listedChoices = async (scope: Scope) => (await fetched(scope)).models.map(modelChoice);

const noListedModels = 'The provider lists no models.';
const metadataWarning = 'models.dev could not be read, so some model details may be missing.';

/** The result of saving models: the provider, how many it keeps, and the harnesses that could not be rewritten. */
async function savedResult(
  scope: Scope,
  saved: {
    id: string;
    name: string;
    modelCount: number;
    harnesses: string[];
    harnessFailures: { harnessId: string; message: string }[];
  },
  extra: { metadataError?: string } = {},
) {
  const harnesses = await harnessIndex(scope);
  const failures = problemsOf(saved.harnessFailures, harnesses);
  return {
    provider: { id: saved.id, name: saved.name },
    modelCount: saved.modelCount,
    rewritten: saved.harnesses
      .filter((id) => !failures.some((failure) => failure.id === id))
      .map((id) => refOf(id, harnesses)),
    failures,
    ...(extra.metadataError ? { metadataError: extra.metadataError } : {}),
  };
}

type SavedResult = Awaited<ReturnType<typeof savedResult>>;

function renderSaved(result: SavedResult, out: Output, message: string) {
  out.success(message);
  if (result.metadataError) out.warn(metadataWarning);
  if (result.rewritten.length) out.hint(`Rewrote ${listing(result.rewritten.map((harness) => harness.name))}.`);
  warnProblems(out, result.failures);
}

const list = command({
  name: 'list',
  aliases: ['ls'],
  summary: "List a provider's models",
  params: {
    provider: providerParam(),
    remote: flag({ summary: 'List the models the provider serves instead, marking the saved ones' }),
  },
  async run({ provider, remote }, scope) {
    const ctx = await scope.services();
    const { models } = ctx.providers.get(provider.id);
    if (!remote) return models;
    let listed: ModelInfo[];
    try {
      ({ listed } = await scope.progress((stage) =>
        ctx.providers.modelChanges(provider.id, { onStage: modelStages(provider, stage) }),
      ));
    } catch (error) {
      throw new CliError(
        'bad_gateway',
        `Could not list the models of "${provider.name}": ${toCliError(error).message}`,
      );
    }
    const saved = new Set(models.map((model) => model.id));
    return listed.map((model) => ({ ...model, saved: saved.has(model.id) }));
  },
  render(models, out, { provider, remote }) {
    if (!models.length) {
      out.hint(remote ? noListedModels : `No models. Choose some with "oms model pick ${shellQuote(provider.name)}".`);
      return;
    }
    modelTable(out, models, remote ? (model) => ('saved' in model && model.saved ? 'yes' : '') : undefined);
  },
});

const pick = command({
  name: 'pick',
  summary: "Choose which of the provider's listed models to keep",
  params: {
    provider: providerParam(),
    all: flag({ summary: 'Keep every model the provider lists' }),
    models: selectMany({
      summary: 'Models',
      positional: true,
      placeholder: 'model',
      details: 'By id, from the list the provider returns. Listed models left out are removed; others stay',
      optional: true,
      requiredWhen: (values) => !values.all,
      empty: noListedModels,
      choices: listedChoices,
      // Like the GUI: start from the saved models, or from everything listed when there are none yet.
      async initial(scope) {
        const ctx = await scope.services();
        const saved = ctx.providers.get(chosen(scope).id).models.map((model) => model.id);
        return saved.length ? saved : (await fetched(scope)).models.map((model) => model.id);
      },
    }),
  },
  async run({ provider, all, models }, scope) {
    const ctx = await scope.services();
    const { models: listed, metadataError } = await fetched(scope);
    const selected = all ? listed.map((model) => model.id) : models;
    const saved = await ctx.providers.pickModels({ providerId: provider.id, listed, selected });
    return savedResult(scope, saved, { metadataError });
  },
  render(result, out) {
    renderSaved(result, out, `"${result.provider.name}" now has ${plural(result.modelCount, 'model')}.`);
  },
  failed: (result) => result.failures.length > 0,
});

const add = command({
  name: 'add',
  summary: "Add some of the provider's listed models, keeping the others",
  params: {
    provider: providerParam(),
    models: selectMany({
      summary: 'Models to add',
      positional: true,
      placeholder: 'model',
      details: 'By id, from the list the provider returns',
      empty: noListedModels,
      async choices(scope) {
        const ctx = await scope.services();
        const saved = new Set(ctx.providers.get(chosen(scope).id).models.map((model) => model.id));
        // Saved models stay choosable, so adding one again is not an error for scripts; it changes nothing.
        return (await fetched(scope)).models.map((model) => ({
          ...modelChoice(model),
          hint: saved.has(model.id) ? 'saved' : modelChoice(model).hint,
        }));
      },
    }),
  },
  async run({ provider, models }, scope) {
    const ctx = await scope.services();
    const { models: listed, metadataError } = await fetched(scope);
    const saved = ctx.providers.get(provider.id).models.map((model) => model.id);
    const added = models.filter((id) => !saved.includes(id));
    if (!added.length) {
      // Nothing new: no save, and no harness is written again.
      const nothing: SavedResult = {
        provider: { id: provider.id, name: provider.name },
        modelCount: saved.length,
        rewritten: [],
        failures: [],
      };
      return { ...nothing, added };
    }
    const result = await ctx.providers.pickModels({ providerId: provider.id, listed, selected: [...saved, ...added] });
    return { ...(await savedResult(scope, result, { metadataError })), added };
  },
  render(result, out) {
    if (!result.added.length) {
      out.hint(`"${result.provider.name}" already has these models.`);
      return;
    }
    renderSaved(result, out, `Added ${plural(result.added.length, 'model')} to "${result.provider.name}".`);
  },
  failed: (result) => result.failures.length > 0,
});

const remove = command({
  name: 'remove',
  aliases: ['rm'],
  summary: 'Remove models from a provider',
  params: {
    provider: providerParam((provider) => (provider.modelCount ? undefined : 'has no models')),
    models: selectMany({
      summary: 'Models to remove',
      positional: true,
      placeholder: 'model',
      details: 'By id',
      async choices(scope) {
        const ctx = await scope.services();
        return ctx.providers.get(chosen(scope).id).models.map(modelChoice);
      },
    }),
  },
  async run({ provider, models }, scope) {
    const ctx = await scope.services();
    const removed = new Set(models);
    const kept = ctx.providers.get(provider.id).models.filter((model) => !removed.has(model.id));
    const result = await ctx.providers.setModels({ providerId: provider.id, models: kept });
    return { ...(await savedResult(scope, result)), removed: models };
  },
  render(result, out) {
    renderSaved(result, out, `Removed ${plural(result.removed.length, 'model')} from "${result.provider.name}".`);
  },
  failed: (result) => result.failures.length > 0,
});

const sync = command({
  name: 'sync',
  summary: 'Update model details from models.dev',
  params: {
    provider: providerParam((provider) => (provider.modelCount ? undefined : 'has no models')),
  },
  async run({ provider }, scope) {
    const ctx = await scope.services();
    const result = await scope.progress((stage) =>
      ctx.providers.syncModels(provider.id, { onStage: modelStages(provider, stage) }),
    );
    return { ...(await savedResult(scope, result)), unmatched: result.unmatched };
  },
  render(result, out) {
    const updated = result.modelCount - result.unmatched;
    if (!updated) {
      out.warn('models.dev has none of these models.');
      return;
    }
    const missing = result.unmatched ? `; ${plural(result.unmatched, 'model')} not found` : '';
    renderSaved(result, out, `Updated ${plural(updated, 'model')} from models.dev${missing}.`);
  },
  failed: (result) => result.failures.length > 0,
});

/** How the provider's list changed since it was last reviewed, fetched once per run. */
function changes(scope: Scope) {
  const provider = chosen(scope);
  return scope.memo(`changes:${provider.id}`, async () => {
    const ctx = await scope.services();
    try {
      return await scope.progress((stage) =>
        ctx.providers.modelChanges(provider.id, { onStage: modelStages(provider, stage) }),
      );
    } catch (error) {
      throw new CliError(
        'bad_gateway',
        `Could not list the models of "${provider.name}": ${toCliError(error).message}`,
      );
    }
  });
}

const review = command({
  name: 'review',
  summary: "Review how the provider's model list changed",
  params: {
    provider: providerParam(),
    add: selectMany({
      summary: 'New models to add',
      placeholder: 'model',
      optional: true,
      choices: async (scope) => (await changes(scope)).added.map(modelChoice),
    }),
    remove: selectMany({
      summary: 'Models no longer listed to remove',
      placeholder: 'model',
      optional: true,
      choices: async (scope) => (await changes(scope)).removed.map(modelChoice),
      // Like the GUI: models that are gone start out ticked.
      initial: async (scope) => (await changes(scope)).removed.map((model) => model.id),
    }),
    ignore: flag({ summary: 'Take none of the changes, and do not offer them again' }),
  },
  async run({ provider, add, remove, ignore }, scope) {
    const ctx = await scope.services();
    const found = await changes(scope);
    const pending = { added: found.added.map((model) => model.id), removed: found.removed.map((model) => model.id) };
    const base = { provider: { id: provider.id, name: provider.name }, pending };
    if (!pending.added.length && !pending.removed.length) return { ...base, reviewed: false as const };
    if (!add.length && !remove.length && !ignore) {
      const question = 'Ignore these changes? They will not be offered again.';
      if (!(await scope.confirm(question, 'ignore'))) return { ...base, reviewed: false as const };
    }
    const saved = await ctx.providers.reviewModels({
      providerId: provider.id,
      add: found.added.filter((model) => add.includes(model.id)),
      remove,
      listed: found.listed.map((model) => model.id),
    });
    return { ...base, reviewed: true as const, added: add, removed: remove, ...(await savedResult(scope, saved)) };
  },
  render(result, out) {
    const { pending } = result;
    if (!result.reviewed) {
      if (!pending.added.length && !pending.removed.length) {
        out.hint('No changes since the last review.');
        return;
      }
      if (pending.added.length) out.print(`New: ${pending.added.join(', ')}`);
      if (pending.removed.length) out.print(`No longer listed: ${pending.removed.join(', ')}`);
      out.hint('Take them with --add <model> and --remove <model>, or pass --ignore.');
      return;
    }
    if (!result.added.length && !result.removed.length) {
      out.success('Ignored the changes.');
      return;
    }
    const parts = [
      result.added.length && `added ${plural(result.added.length, 'model')}`,
      result.removed.length && `removed ${plural(result.removed.length, 'model')}`,
    ].filter(Boolean);
    renderSaved(result, out, `${parts.join(' and ').replace(/^./, (letter) => letter.toUpperCase())}.`);
  },
  failed: (result) => result.reviewed && result.failures.length > 0,
});

export const model = group({
  name: 'model',
  aliases: ['models'],
  summary: "Manage a provider's models",
  children: [list, pick, add, remove, sync, review],
});
