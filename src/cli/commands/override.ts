import { type Choice, command, group, type Scope, select, text } from '#cli/framework/command.ts';
import { CliError, ParamError } from '#cli/framework/errors.ts';
import { plural, shellQuote } from '#cli/framework/text.ts';
import type { ModelOverride, ProviderModelOverride } from '#core/provider.ts';
import { modelOverrideInput, providerModelOverrideInput } from '#core/providers/schemas.ts';
import { formatTokens, modelChoice, type ProviderSummary, providerChoices } from './shared.ts';

const chosen = (scope: Scope) => scope.values.provider as ProviderSummary | undefined;

const provider = (disabled?: (provider: ProviderSummary) => string | undefined) =>
  select({
    summary: 'Provider',
    optional: true,
    target: true,
    placeholder: 'provider',
    details: "Its name or id; without it, the override is global and applies to every provider's model",
    async choices(scope) {
      const providers = await providerChoices(scope, disabled);
      if (!providers.length) return [];
      // No keys and no value: picking it leaves --provider unset, which is also what the prompt starts on.
      const global: Choice<ProviderSummary | undefined> = {
        value: undefined,
        keys: [],
        label: 'All providers',
        hint: 'global',
      };
      return [global, ...providers];
    },
  });

/** The overrides in the chosen scope: the provider's own, or the global ones. */
async function overridesOf(scope: Scope): Promise<Record<string, ModelOverride>> {
  const ctx = await scope.services();
  const provider = chosen(scope);
  return provider ? ctx.providers.get(provider.id).modelOverrides : ctx.providers.modelOverrides();
}

/** One model's override in the chosen scope, empty when it has none. */
async function currentOverride(scope: Scope, model: string): Promise<ModelOverride> {
  const overrides = await overridesOf(scope);
  return Object.hasOwn(overrides, model) ? (overrides[model] as ModelOverride) : {};
}

const describeOverride = (override: ModelOverride) =>
  [
    override.name,
    override.contextWindow && `${formatTokens(override.contextWindow)} context`,
    override.maxOutput && `${formatTokens(override.maxOutput)} output`,
  ]
    .filter(Boolean)
    .join(', ');

/**
 * Models an override can be set for: the provider's saved models, or for a global one, every model a provider
 * saves and every model that already has a global override.
 */
async function settableModels(scope: Scope): Promise<Choice<string>[]> {
  const ctx = await scope.services();
  const provider = chosen(scope);
  const overrides = await overridesOf(scope);
  const models = provider ? ctx.providers.get(provider.id).models : ctx.providers.baseModels();
  const ids = new Set(models.map((model) => model.id));
  const others = provider ? [] : Object.keys(overrides).filter((id) => !ids.has(id));
  return [...models, ...others.map((id) => ({ id }))].map((model) => ({
    ...modelChoice(model),
    hint: Object.hasOwn(overrides, model.id) ? 'overridden' : modelChoice(model).hint,
  }));
}

const modelId = (raw: string) => {
  if (!raw.trim() || raw.length > 256) throw new ParamError('Model id must contain 1 to 256 characters.');
  return raw;
};

/** An override field: unset leaves it as it is; an empty value, as null, clears it. */
const tokens = (summary: string, field: 'contextWindow' | 'maxOutput') =>
  text({
    summary,
    optional: true,
    details: 'An empty value clears it',
    initial: async (scope) => (await currentOverride(scope, scope.values.model as string))[field]?.toString(),
    parse: (raw): number | null => {
      if (!raw.trim()) return null;
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1)
        throw new ParamError('Must be a positive integer.');
      return Number(raw);
    },
  });

const list = command({
  name: 'list',
  summary: 'List global or provider model overrides',
  params: { provider: provider() },
  run: (_values, scope): Promise<Record<string, ProviderModelOverride>> => overridesOf(scope),
  render(result, out, { provider }) {
    const rows = Object.entries(result);
    if (!rows.length) {
      out.hint(provider ? `"${provider.name}" has no model overrides.` : 'No global model overrides.');
      return;
    }
    out.table(
      ['MODEL', 'NAME', 'CONTEXT', 'OUTPUT'],
      rows.map(([model, value]) => [
        model,
        value.name ?? '-',
        value.contextWindow?.toString() ?? '-',
        value.maxOutput?.toString() ?? '-',
      ]),
    );
  },
});

const set = command({
  name: 'set',
  summary: "Set fields of a model's override, keeping the others",
  params: {
    provider: provider((provider) => (provider.modelCount ? undefined : 'has no models')),
    model: text({
      summary: 'Model',
      positional: true,
      placeholder: 'model',
      details: 'Its id, exactly; for a provider override, one of its saved models',
      parse: modelId,
      complete: settableModels,
      // A global override may name a model no provider saves yet.
      suggest: async (scope) => ({ choices: await settableModels(scope), open: !chosen(scope) }),
    }),
    name: text({
      summary: 'Display name',
      optional: true,
      details: 'An empty value clears it',
      initial: async (scope) => (await currentOverride(scope, scope.values.model as string)).name,
      parse: (raw): string | null => {
        if (raw.length > 256) throw new ParamError('Name must contain at most 256 characters.');
        return raw.trim() || null;
      },
    }),
    context: tokens('Maximum context in tokens', 'contextWindow'),
    output: tokens('Maximum output in tokens', 'maxOutput'),
  },
  async run({ provider, model, name, context, output }, scope) {
    const changes = { name, contextWindow: context, maxOutput: output };
    if (Object.values(changes).every((value) => value === undefined)) {
      if (scope.session.interactive) return undefined;
      throw new CliError('usage', 'Nothing to change', 'Pass --name, --context or --output.');
    }
    const ctx = await scope.services();
    if (provider && !ctx.providers.get(provider.id).models.some((item) => item.id === model))
      throw new CliError('usage', 'This model is not saved in the provider. Add or select it first.');
    const next: Record<string, unknown> = { ...(await currentOverride(scope, model)) };
    for (const [field, value] of Object.entries(changes)) {
      if (value === null) delete next[field];
      else if (value !== undefined) next[field] = value;
    }
    if (!Object.keys(next).length) {
      const scoped = provider ? ` --provider ${shellQuote(provider.name)}` : '';
      throw new CliError(
        'usage',
        'Every field of the override would be cleared',
        `Remove it with "oms override remove ${shellQuote(model)}${scoped}".`,
      );
    }
    if (!provider) return ctx.providers.setModelOverride(modelOverrideInput.parse({ modelId: model, override: next }));
    const saved = await ctx.providers.setProviderModelOverride(
      providerModelOverrideInput.parse({ providerId: provider.id, modelId: model, override: next }),
    );
    return {
      affected: 1,
      failures: saved.harnessFailures.map((failure) => ({
        providerId: saved.id,
        providerName: saved.name,
        ...failure,
      })),
    };
  },
  render(result, out) {
    if (!result) {
      out.hint('Nothing changed.');
      return;
    }
    out.success(`Saved override for ${plural(result.affected, 'provider')}.`);
    for (const failure of result.failures)
      out.warn(`${failure.providerName} / ${failure.harnessId}: ${failure.message}`);
  },
  failed: (result) => Boolean(result?.failures.length),
});

const remove = command({
  name: 'remove',
  aliases: ['rm'],
  summary: 'Remove an override and restore inheritance',
  params: {
    provider: provider(),
    model: select({
      summary: 'Model',
      positional: true,
      placeholder: 'model',
      details: 'Its id',
      empty: 'There is no override to remove.',
      async choices(scope) {
        return Object.entries(await overridesOf(scope)).map(([id, override]) => ({
          value: id,
          keys: [id],
          label: id,
          hint: describeOverride(override) || undefined,
        }));
      },
    }),
  },
  confirm: ({ provider, model }) =>
    `Remove the ${provider ? `provider "${provider.name}"` : 'global'} override for "${model}"?`,
  async run({ provider, model }, scope) {
    const ctx = await scope.services();
    if (!provider) return ctx.providers.removeModelOverride(model);
    const saved = await ctx.providers.setProviderModelOverride(
      providerModelOverrideInput.parse({ providerId: provider.id, modelId: model, override: {} }),
    );
    return {
      affected: 1,
      failures: saved.harnessFailures.map((failure) => ({
        providerId: saved.id,
        providerName: saved.name,
        ...failure,
      })),
    };
  },
  render(result, out) {
    out.success(`Removed override for ${plural(result.affected, 'provider')}.`);
    for (const failure of result.failures)
      out.warn(`${failure.providerName} / ${failure.harnessId}: ${failure.message}`);
  },
  failed: (result) => result.failures.length > 0,
});

export const override = group({
  name: 'override',
  summary: 'Manage global and provider model overrides',
  children: [list, set, remove],
});
