// Publish the oms CLI to npm: `pnpm publish:cli [--dry-run] [--otp <code>]`. Other options go to `pnpm publish`.
// Checks git and the version first, then verifies, builds, checks what goes into the package, publishes out/cli,
// and tags the commit `v<version>`. The CLI and the app share the version in package.json. A dry run skips the git
// checks and the tag, so it can run on a working tree with changes.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const outDir = 'out/cli';
const expectedFiles = ['LICENSE', 'oms.mjs', 'package.json'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0) fail(`${command} ${commandArgs.join(' ')} failed`);
};
const output = (command, commandArgs) => execFileSync(command, commandArgs, { encoding: 'utf8' }).trim();
const step = (message) => console.log(`\n▸ ${message}`);

step(`Checking ohmyswitch ${version}`);
if (!dryRun) {
  const branch = output('git', ['branch', '--show-current']);
  if (branch !== 'main') fail(`Publish from main, not ${branch || 'a detached HEAD'}`);
  if (output('git', ['status', '--porcelain'])) fail('Commit or stash the changes first');
  if (spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]).status === 0) {
    fail(`Tag ${tag} already exists; raise the version in package.json`);
  }
}
const view = spawnSync('pnpm', ['view', `ohmyswitch@${version}`, 'version', '--json'], { encoding: 'utf8' });
if (view.status === 0) fail(`ohmyswitch@${version} is already on npm; raise the version in package.json`);
if (!view.stdout.includes('ERR_PNPM_PACKAGE_NOT_FOUND')) {
  fail(`Cannot ask npm about ohmyswitch@${version}:\n${view.stdout}${view.stderr}`);
}

step('Verifying');
run('pnpm', ['typecheck']);
run('pnpm', ['lint']);

step('Building');
run('pnpm', ['build:cli']);
const built = output('node', [`${outDir}/oms.mjs`, '--version']);
if (built !== version) fail(`The bundle reports version ${built}, expected ${version}`);

step('Checking the package contents');
const packed = JSON.parse(output('pnpm', ['pack', '--dry-run', '--json', '-C', outDir]));
const files = packed.files.map((file) => file.path).sort();
if (files.join('\n') !== expectedFiles.join('\n')) {
  fail(`The package would contain ${files.join(', ')}; expected ${expectedFiles.join(', ')}`);
}
console.log(files.join('\n'));

step(dryRun ? 'Publishing (dry run)' : 'Publishing');
run('pnpm', ['publish', outDir, ...args, ...(dryRun ? ['--no-git-checks'] : [])]);

if (dryRun) {
  console.log(`\n✔ Dry run of ohmyswitch@${version} passed`);
} else {
  run('git', ['tag', tag]);
  console.log(`\n✔ Published ohmyswitch@${version} and tagged ${tag}. Push the tag with: git push origin ${tag}`);
}
