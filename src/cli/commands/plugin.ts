import { type Choice, command, group, type Scope, select } from '#cli/framework/command.ts';
import { CliError } from '#cli/framework/errors.ts';
import type { Output } from '#cli/framework/output.ts';
import type { PluginService } from '#core/plugins/service.ts';

type PluginList = Awaited<ReturnType<PluginService['list']>>;
type PluginEntry = PluginList['entries'][number];

const lockedReason = 'decided by plugins.patch.yml';

function stateOf(entry: PluginEntry) {
  switch (entry.state) {
    case 'active':
      return 'enabled';
    case 'disabled':
      return 'disabled';
    case 'failed':
      return `failed${entry.error ? `: ${entry.error}` : ''}`;
    default:
      return 'loading';
  }
}

function warnFileErrors(out: Output, plugins: PluginList) {
  if (plugins.fileError) out.warn(`${plugins.path} cannot be read: ${plugins.fileError}`);
  if (plugins.patchError) out.warn(`${plugins.patchPath} cannot be read: ${plugins.patchError}`);
}

const list = command({
  name: 'list',
  aliases: ['ls'],
  summary: 'List plugins',
  params: {},
  async run(_values, scope) {
    return (await scope.services()).plugins.list();
  },
  render(plugins, out) {
    warnFileErrors(out, plugins);
    out.table(
      ['PLUGIN', 'ID', 'STATE', 'NOTE'],
      plugins.entries.map((entry) => [entry.title, entry.id, stateOf(entry), entry.locked ? lockedReason : '']),
    );
  },
});

async function pluginChoices(scope: Scope): Promise<Choice<PluginEntry>[]> {
  const { entries } = await (await scope.services()).plugins.list();
  return entries.map((entry) => ({
    value: entry,
    keys: [entry.id, entry.title, entry.name],
    label: entry.title,
    hint: stateOf(entry),
    disabled: entry.locked ? lockedReason : undefined,
  }));
}

function switchCommand(enabled: boolean) {
  const verb = enabled ? 'Enable' : 'Disable';
  return command({
    name: enabled ? 'enable' : 'disable',
    summary: `${verb} a plugin`,
    params: {
      plugin: select({
        summary: 'Plugin',
        positional: true,
        placeholder: 'plugin',
        details: 'Its id or name',
        empty: 'Every plugin is decided by plugins.patch.yml.',
        choices: pluginChoices,
      }),
    },
    async run({ plugin }, scope) {
      const ctx = await scope.services();
      const plugins = await ctx.plugins.list();
      const broken = plugins.fileError ? plugins.path : plugins.patchError ? plugins.patchPath : undefined;
      if (broken) throw new CliError('precondition_failed', `${broken} has errors; fix it first`);
      await ctx.plugins.setEnabled(plugin.id, enabled);
      return { id: plugin.id, title: plugin.title, enabled };
    },
    render(result, out) {
      out.success(`${enabled ? 'Enabled' : 'Disabled'} ${result.title}.`);
    },
  });
}

export const plugin = group({
  name: 'plugin',
  aliases: ['plugins'],
  summary: 'Enable or disable plugins',
  children: [list, switchCommand(true), switchCommand(false)],
});
