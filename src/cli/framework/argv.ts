import { type Command, flagName, type Group, type Node, type Params } from './command.ts';
import { CliError } from './errors.ts';

import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';

/** Options every command accepts. */
export const globalOptions = {
  json: { type: 'boolean', summary: 'Print the result as JSON; never prompt' },
  'no-input': { type: 'boolean', summary: 'Never prompt; fail when something is missing' },
  yes: { type: 'boolean', short: 'y', summary: 'Confirm irreversible operations in advance' },
  verbose: { type: 'boolean', summary: 'Print logs to stderr' },
  help: { type: 'boolean', short: 'h', summary: 'Show help' },
  version: { type: 'boolean', short: 'V', summary: 'Show the version' },
} as const;

export type GlobalName = keyof typeof globalOptions;
export type Globals = Record<GlobalName, boolean>;

export type OptionValue = string | boolean | (string | boolean)[] | undefined;

/** A command line split into where it leads and what it says there. */
export interface Invocation {
  node: Node;
  /** Command names from the root to `node`, as written in help and equivalent commands. */
  path: string[];
  globals: Globals;
  positionals: string[];
  options: Record<string, OptionValue>;
}

export const globalByToken = new Map<string, GlobalName>(
  Object.entries(globalOptions).flatMap(([name, option]) => {
    const tokens: [string, GlobalName][] = [[`--${name}`, name as GlobalName]];
    if ('short' in option) tokens.push([`-${option.short}`, name as GlobalName]);
    return tokens;
  }),
);

export const findChild = (group: Group, name: string) =>
  group.children.find((child) => child.name === name || child.aliases?.includes(name));

/** The option names a command accepts, as `parseArgs` takes them. Secrets get their `-stdin` and `-env` forms. */
export function commandOptions(command: Command): ParseArgsOptionsConfig {
  const options: ParseArgsOptionsConfig = {};
  for (const [key, param] of Object.entries(command.params as Params)) {
    if (param.positional) continue;
    const name = flagName(key, param);
    if (param.kind === 'secret') {
      options[`${name}-stdin`] = { type: 'boolean' };
      options[`${name}-env`] = { type: 'string' };
    } else if (param.kind === 'flag') {
      options[name] = { type: 'boolean', ...(param.short ? { short: param.short } : {}) };
    } else {
      options[name] = { type: 'string', multiple: param.multiple, ...(param.short ? { short: param.short } : {}) };
    }
  }
  return options;
}

/**
 * Follow command names from the root, then parse the rest against the command reached. Global switches may come
 * anywhere; `help <command...>` is the same as `<command...> --help`.
 */
export function parseCommandLine(root: Group, argv: readonly string[]): Invocation {
  const tokens = [...argv];
  const leading: string[] = [];
  let node: Node = root;
  const path: string[] = [];
  let help = false;
  while (node.type === 'group' && tokens.length) {
    const token = tokens[0] as string;
    if (globalByToken.has(token)) {
      leading.push(token);
      tokens.shift();
      continue;
    }
    if (token.startsWith('-')) break;
    if (token === 'help' && !findChild(node, token)) {
      help = true;
      tokens.shift();
      continue;
    }
    const child = findChild(node, token);
    if (!child) {
      const command = ['oms', ...path].join(' ');
      throw new CliError('usage', `Unknown command "${token}"`, `Run "${command} --help" to see the commands.`);
    }
    node = child;
    path.push(child.name);
    tokens.shift();
  }

  const options: ParseArgsOptionsConfig = Object.fromEntries(
    Object.entries(globalOptions).map(([name, option]) => [
      name,
      { type: option.type, ...('short' in option ? { short: option.short } : {}) },
    ]),
  );
  if (node.type === 'command') Object.assign(options, commandOptions(node));
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...leading, ...tokens],
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    const command = ['oms', ...path].join(' ');
    throw new CliError(
      'usage',
      error instanceof Error ? error.message.replace(/\s*To specify a positional argument.*$/s, '') : String(error),
      `Run "${command} --help" for usage.`,
    );
  }
  const values = parsed.values as Record<string, OptionValue>;
  const globals = Object.fromEntries(
    Object.keys(globalOptions).map((name) => [name, values[name] === true]),
  ) as Globals;
  if (help) globals.help = true;
  for (const name of Object.keys(globalOptions)) delete values[name];
  if (node.type === 'group' && parsed.positionals.length && !globals.help) {
    const command = ['oms', ...path].join(' ');
    throw new CliError(
      'usage',
      `Unknown command "${parsed.positionals[0]}"`,
      `Run "${command} --help" to see the commands.`,
    );
  }
  return { node, path, globals, positionals: parsed.positionals, options: values };
}
