import { defineConfig } from 'tsdown';

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
  description: string;
};

/** The package.json published to npm with the bundle: no dependencies, since everything is bundled. */
const published = {
  name: 'ohmyswitch',
  version: manifest.version,
  description: manifest.description,
  type: 'module',
  bin: { oms: 'oms.mjs', ohmyswitch: 'oms.mjs' },
  files: ['oms.mjs'],
  engines: { node: '>=24.14.0' },
};

/**
 * The CLI as one ESM file in out/cli, ready for `npm publish out/cli`. Dependencies are bundled rather than
 * installed: the pnpm patch of @cordisjs/plugin-include only exists in this repository, and pinned versions stay
 * pinned for users.
 */
export default defineConfig({
  entry: { oms: 'src/cli/index.ts' },
  outDir: 'out/cli',
  clean: true,
  format: 'esm',
  platform: 'node',
  target: 'node24.14',
  tsconfig: 'tsconfig.node.json',
  fixedExtension: true,
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
  define: { __OMS_VERSION__: JSON.stringify(manifest.version) },
  // Every dependency is a devDependency and bundled on purpose; the hint about bundling them is noise.
  deps: { onlyBundle: false },
  // Prefer ESM builds, as Vite does: jsonc-parser's `main` is a UMD build whose requires cannot be bundled.
  inputOptions: { resolve: { mainFields: ['module', 'main'] } },
  async onSuccess(config) {
    await writeFile(join(config.outDir, 'package.json'), `${JSON.stringify(published, null, 2)}\n`);
  },
});
