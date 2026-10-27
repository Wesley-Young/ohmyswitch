import { command, group, text } from '#cli/framework/command.ts';
import { CliError, ParamError } from '#cli/framework/errors.ts';

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
  summary: 'List global model overrides',
  params: {},
  async run(_, scope) {
    return (await scope.services()).providers.modelOverrides();
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
  summary: 'Replace the global override for a model',
  params: {
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
  async run({ model, name, context, output }, scope) {
    if (name === undefined && context === undefined && output === undefined)
      throw new CliError('usage', 'Specify at least one of --name, --context or --output.');
    return (await scope.services()).providers.setModelOverride({
      modelId: model,
      override: {
        ...(name !== undefined && { name }),
        ...(context !== undefined && { contextWindow: context }),
        ...(output !== undefined && { maxOutput: output }),
      },
    });
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
  summary: 'Remove a global model override',
  params: { model: id() },
  confirm: ({ model }) => `Remove the global override for "${model}"?`,
  async run({ model }, scope) {
    return (await scope.services()).providers.removeModelOverride(model);
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
  summary: 'Manage global model overrides',
  children: [list, set, remove],
});
