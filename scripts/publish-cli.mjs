// Publish the oms CLI to npm: `pnpm publish:cli [--dry-run] [--otp <code>]`. Other options go to the publisher.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const outDir = './out/cli';
const expectedFiles = ['LICENSE', 'oms.mjs', 'package.json'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const githubActions = process.env.GITHUB_ACTIONS === 'true';
const githubRelease =
  githubActions && process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === `refs/tags/v${version}`;

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
  if (githubActions) {
    if (!githubRelease) fail(`Publish from the v${version} tag in GitHub Actions`);
  } else {
    const branch = output('git', ['branch', '--show-current']);
    if (branch !== 'main') fail(`Publish from main, not ${branch || 'a detached HEAD'}`);
  }
  if (output('git', ['status', '--porcelain'])) fail('Commit or stash the changes first');
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
// npm's OIDC support authenticates tag-triggered GitHub Actions runs without a long-lived token.
if (githubRelease) {
  run('npm', ['publish', outDir, ...args]);
} else {
  run('pnpm', ['publish', outDir, ...args, ...(dryRun ? ['--no-git-checks'] : [])]);
}

if (dryRun) {
  console.log(`\n✔ Dry run of ohmyswitch@${version} passed`);
} else {
  console.log(`\n✔ Published ohmyswitch@${version}`);
}
