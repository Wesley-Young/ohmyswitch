import { commands } from './commands/index.ts';
import { loadConfig } from './config.ts';
import { Output } from './framework/output.ts';
import { runCli } from './framework/run.ts';
import { CliSession } from './session.ts';

import { setGlobalProxyFromEnv } from 'node:http';

/** Proxy support for fetch at runtime arrived in this release. */
const minimumNode = [24, 14] as const;

function nodeIsSupported() {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  return major > minimumNode[0] || (major === minimumNode[0] && minor >= minimumNode[1]);
}

async function main() {
  const output = new Output();
  if (!nodeIsSupported()) {
    output.error(`oms needs Node.js ${minimumNode.join('.')} or later; this is ${process.versions.node}.`);
    return 1;
  }
  const config = loadConfig();
  setGlobalProxyFromEnv(config.env);
  return runCli(commands, process.argv.slice(2), {
    version: config.version,
    output,
    session: (globals) => new CliSession(config, output, globals),
  });
}

main().then(
  (code) => {
    process.exitCode = code;
    // Idle keep-alive sockets may hold the process open for a few seconds; nothing is left to do by now.
    setTimeout(() => process.exit(code), 200).unref();
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exitCode = 1;
  },
);
