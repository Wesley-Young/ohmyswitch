// Add shadcn/ui components: `pnpm ui:add <component...>`.
// The shadcn CLI cannot detect electron-vite, so a placeholder vite.config.ts is created for the duration of the
// command. Dependencies the CLI adds are renderer-only and bundled, so they are moved to devDependencies.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });
const dependencies = () => JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {};

const components = process.argv.slice(2);
if (!components.length) {
  console.error('Usage: pnpm ui:add <component...>');
  process.exit(1);
}

const placeholder = 'vite.config.ts';
const created = !existsSync(placeholder);
if (created) writeFileSync(placeholder, 'export default {};\n');
const before = dependencies();
try {
  run('pnpm', ['exec', 'shadcn', 'add', '--yes', ...components]);
} finally {
  if (created) rmSync(placeholder);
}

const after = dependencies();
const added = Object.keys(after).filter((name) => !(name in before));
if (added.length) {
  run('pnpm', ['remove', ...added]);
  run('pnpm', ['add', '--save-dev', ...added.map((name) => `${name}@${after[name]}`)]);
}
run('pnpm', ['exec', 'biome', 'check', '--write', 'src/renderer/components/ui']);
