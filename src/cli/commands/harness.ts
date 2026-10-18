import { command, group } from '#cli/framework/command.ts';
import { harnessIndex } from './shared.ts';

const list = command({
  name: 'list',
  aliases: ['ls'],
  summary: 'List harnesses and where their configs are',
  params: {},
  async run(_values, scope) {
    return [...(await harnessIndex(scope)).values()];
  },
  render(harnesses, out) {
    if (!harnesses.length) {
      out.hint('Every harness plugin is disabled. See "oms plugin list".');
      return;
    }
    out.table(
      ['NAME', 'ID', 'STATUS', 'CONFIG'],
      harnesses.map((harness) => [
        harness.name,
        harness.id,
        harness.detected ? 'found' : 'not found',
        harness.configPath,
      ]),
    );
  },
});

export const harness = group({
  name: 'harness',
  aliases: ['harnesses'],
  summary: 'Inspect harnesses',
  children: [list],
});
