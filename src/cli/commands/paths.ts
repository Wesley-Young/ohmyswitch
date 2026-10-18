import { command } from '#cli/framework/command.ts';

import { join } from 'node:path';

export const paths = command({
  name: 'paths',
  summary: 'Show where ohmyswitch keeps its files',
  params: {},
  run(_values, scope) {
    const { dirs } = scope.session.config;
    return {
      ...dirs,
      plugins: join(dirs.config, 'plugins.yml'),
      pluginPatches: join(dirs.config, 'plugins.patch.yml'),
      store: join(dirs.data, 'store.json'),
    };
  },
  render(result, out) {
    out.fields([
      ['Providers', result.store],
      ['Plugins', result.plugins],
      ['Plugin patches', result.pluginPatches],
      ['Cache', result.cache],
      ['Logs (GUI)', result.logs],
    ]);
  },
});
