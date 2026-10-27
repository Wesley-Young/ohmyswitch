import { command, group, select, text } from '#cli/framework/command.ts';
import { CliError, ParamError } from '#cli/framework/errors.ts';
import type { ProviderModelOverride } from '#core/provider.ts';
import { providerModelOverrideInput } from '#core/providers/schemas.ts';
import { noProviders, providerChoices } from './shared.ts';

const provider = () =>
  select({
    summary: 'Override only this provider (default: global)',
    optional: true,
    ask: false,
    placeholder: 'provider',
    details: 'Its name or id',
    empty: noProviders,
    choices: providerChoices,
  });
const id = () =>
  text({
    summary: 'Model id (exact match)',
    positional: true,
    placeholder: 'model',
    parse: (raw) => {
      if (!raw.trim() || raw.length > 256) throw new ParamError('Model id must contain 1 to 256 characters.');
      return raw;
    },
  });
const tokens = (summary: string) =>
  text({
    summary,
    optional: true,
    ask: false,
    parse: (raw) => {
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1)
        throw new ParamError('Must be a positive integer.');
      return Number(raw);
    },
  });

const list = command({
  name: 'list',
  summary: 'List global or provider model overrides',
  params: { provider: provider() },
  async run({ provider }, scope): Promise<Record<string, ProviderModelOverride>> {
    const ctx = await scope.services();
    return provider ? ctx.providers.get(provider.id).modelOverrides : ctx.providers.modelOverrides();
  },
  render(result, out) {
    out.table(
      ['MODEL', 'NAME', 'CONTEXT', 'OUTPUT'],
      Object.entries(result).map(([model, value]) => [
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
  summary: 'Replace the entire override for a model',
  params: {
    provider: provider(),
    model: id(),
    name: text({
      summary: 'Display name',
      optional: true,
      ask: false,
      parse: (raw) => {
        if (!raw.trim() || raw.length > 256) throw new ParamError('Name must contain 1 to 256 characters.');
        return raw.trim();
      },
    }),
    context: tokens('Maximum context in tokens'),
    output: tokens('Maximum output in tokens'),
  },
  async run({ provider, model, name, context, output }, scope) {
    const override = {
      ...(name !== undefined && { name }),
      ...(context !== undefined && { contextWindow: context }),
      ...(output !== undefined && { maxOutput: output }),
    };
    if (!Object.keys(override).length)
      throw new CliError(
        'usage',
        'Specify at least one override field, or use "override remove" to restore inheritance.',
      );
    const ctx = await scope.services();
    if (!provider) return ctx.providers.setModelOverride({ modelId: model, override });
    if (!ctx.providers.get(provider.id).models.some((item) => item.id === model))
      throw new CliError('usage', 'This model is not saved in the provider. Add or select it first.');
    const saved = await ctx.providers.setProviderModelOverride(
      providerModelOverrideInput.parse({ providerId: provider.id, modelId: model, override }),
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
    out.success(`Saved override for ${result.affected} providers.`);
    for (const failure of result.failures)
      out.warn(`${failure.providerName} / ${failure.harnessId}: ${failure.message}`);
  },
  failed: (result) => result.failures.length > 0,
});
const remove = command({
  name: 'remove',
  aliases: ['rm'],
  summary: 'Remove an override and restore inheritance',
  params: { provider: provider(), model: id() },
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
    out.success(`Removed override for ${result.affected} providers.`);
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
