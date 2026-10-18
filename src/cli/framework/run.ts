import { type Globals, type Invocation, parseCommandLine } from './argv.ts';
import {
  type Choice,
  type Command,
  flagName,
  type Group,
  type ParamSpec,
  type Params,
  paramLabel,
  type RunScope,
  type Scope,
  type Session,
} from './command.ts';
import { Cancelled, CliError, exitCodes, ParamError, toCliError } from './errors.ts';
import { commandHelp, groupHelp } from './help.ts';
import type { Output } from './output.ts';
import { type Answer, ask, confirm, pickEntry } from './prompt.ts';
import { shellQuote } from './text.ts';

export interface RunOptions {
  version: string;
  output: Output;
  /** Build the session once the global options are known. */
  session: (globals: Globals) => Session;
}

/** Run one command line and return the exit status. */
export async function runCli(root: Group, argv: readonly string[], options: RunOptions): Promise<number> {
  const { output: out } = options;
  let invocation: Invocation;
  try {
    invocation = parseCommandLine(root, argv);
  } catch (error) {
    return report(toCliError(error), out, argv.includes('--json'));
  }
  const { node, path, globals } = invocation;
  if (globals.version) {
    out.print(options.version);
    return 0;
  }
  if (globals.help) {
    out.print(node.type === 'group' ? groupHelp(node, path) : commandHelp(node, path));
    return 0;
  }
  const session = options.session(globals);
  try {
    if (node.type === 'group') {
      if (!session.interactive) {
        out.print(groupHelp(node, path));
        return 0;
      }
      await menu(node, path, session);
      return 0;
    }
    return await execute(node, path, invocation, session);
  } catch (error) {
    return report(toCliError(error), out, session.json);
  } finally {
    await session.reset();
  }
}

/**
 * Pick commands from a menu until the user leaves it. Each command runs as if its name had been typed with nothing
 * after it, so every parameter is asked; afterwards the services stop, so the next command sees changes made
 * meanwhile, such as by the GUI.
 *
 * After a command, finished or failed, the menu starts over where it was entered, since the next step of a task
 * (add a provider, then apply it) is usually elsewhere in the tree. Esc backs out one step: out of a command's
 * prompts to the menu it was picked from, or up one menu. Ctrl-C ends the CLI from anywhere.
 */
async function menu(start: Group, startPath: readonly string[], session: Session): Promise<void> {
  const stack = [{ group: start, path: [...startPath] }];
  session.out.hint('Esc goes back, Ctrl-C quits.');
  for (;;) {
    const { group, path } = stack.at(-1) as (typeof stack)[number];
    const entered = stack.length === 1;
    const entries = group.children.map((child) => ({
      value: child,
      label: child.name,
      hint: child.type === 'group' ? `${child.summary} …` : child.summary,
    }));
    const child = await pickEntry(path.length ? group.summary : 'What do you want to do?', [
      ...entries,
      { value: undefined, label: entered ? 'Exit' : 'Back' },
    ]);
    if (!child) {
      if (entered) return;
      stack.pop();
      continue;
    }
    const childPath = [...path, child.name];
    if (child.type === 'group') {
      stack.push({ group: child, path: childPath });
      continue;
    }
    try {
      await execute(
        child,
        childPath,
        { node: child, path: childPath, globals: {} as Globals, positionals: [], options: {} },
        session,
      );
      stack.splice(1);
    } catch (error) {
      const failure = toCliError(error);
      if (failure instanceof Cancelled) {
        if (failure.interrupted) throw failure;
      } else {
        report(failure, session.out, false);
        stack.splice(1);
      }
    } finally {
      await session.reset();
    }
    session.out.print();
  }
}

const isGiven = (raw: readonly string[] | undefined) => raw !== undefined && raw.length > 0;

/**
 * Resolve every parameter, confirm if needed, run the command and print its result. Parameters resolve in
 * declaration order, each seeing the ones before it: from the command line when given there, otherwise by
 * prompting when that is possible, otherwise as missing.
 */
async function execute(command: Command, path: readonly string[], invocation: Invocation, session: Session) {
  const { out } = session;
  const params = Object.entries(command.params as Params);
  const help = `Run "${['oms', ...path].join(' ')} --help" for usage.`;
  const raw = await rawValues(params, invocation, session, help);

  const values: Record<string, unknown> = {};
  /** How each parameter would be written on the command line, for the equivalent command. */
  const written = new Map<string, string[]>();
  const confirmedFlags = new Set<string>();
  let prompted = false;
  const scope: Scope = { session, services: () => session.services(), values };
  // Optional parameters are asked only when the command line gave none of them: `oms provider edit X` asks what
  // to change, `oms provider edit X --name Y` just renames.
  const explicitOptional = params.some(
    ([key, param]) => param.optional && param.kind !== 'flag' && isGiven(raw.get(key)),
  );

  for (const [key, param] of params) {
    const label = paramLabel(key, param);
    const given = raw.get(key);
    if (param.kind === 'flag') {
      values[key] = isGiven(given);
      if (values[key]) written.set(key, []);
      continue;
    }
    if (isGiven(given)) {
      try {
        values[key] = await resolveRaw(param, given as string[], scope);
      } catch (error) {
        if (error instanceof ParamError) throw new CliError(error.kind, `${label}: ${error.message}`, help);
        throw error;
      }
      written.set(key, param.kind === 'select' ? await keysOf(param, given as string[], scope) : (given as string[]));
      continue;
    }
    const required = param.optional ? (param.requiredWhen?.(values) ?? false) : true;
    const askable = session.interactive && param.ask;
    if (askable && (required || (!param.requiredWhen && !explicitOptional))) {
      const answer: Answer = await ask(param, required, scope);
      prompted = true;
      values[key] = answer.value ?? (param.multiple ? [] : undefined);
      if (answer.value !== undefined) written.set(key, answer.raws);
      continue;
    }
    if (required) throw new CliError('usage', `Missing ${describeMissing(key, param)}`, help);
    values[key] = param.multiple ? [] : undefined;
  }

  const confirmation = await command.confirm?.(values, scope);
  let confirmedYes = false;
  if (confirmation && !session.yes) {
    if (!session.interactive) {
      throw new CliError('usage', `Needs confirmation: ${confirmation}`, 'Run it again with --yes to confirm.');
    }
    if (!(await confirm(confirmation))) throw new Cancelled();
    confirmedYes = true;
  }

  const runScope: RunScope = {
    ...scope,
    out,
    async confirm(message, flag) {
      if (values[flag] === true) return true;
      if (!session.interactive) return false;
      const yes = await confirm(message);
      if (yes) confirmedFlags.add(flag);
      return yes;
    },
  };
  const result = await command.run(values as never, runScope);
  if (session.json) out.json(result);
  else command.render?.(result as never, out, values as never);

  if (session.interactive && (prompted || confirmedYes || confirmedFlags.size)) {
    const line = equivalent(path, params, written, confirmedFlags, confirmedYes);
    out.hint(`Equivalent command: ${line}`);
  }
  return command.failed?.(result as never) ? exitCodes.failed : 0;
}

/** Each parameter's raw strings from the command line; secrets are read from where their options point. */
async function rawValues(
  params: readonly [string, ParamSpec][],
  invocation: Invocation,
  session: Session,
  help: string,
) {
  const raw = new Map<string, string[]>();
  const positionals = [...invocation.positionals];
  for (const [key, param] of params) {
    if (!param.positional || !positionals.length) continue;
    raw.set(key, param.multiple ? positionals.splice(0) : [positionals.shift() as string]);
  }
  if (positionals.length) throw new CliError('usage', `Unexpected argument "${positionals[0]}"`, help);
  for (const [key, param] of params) {
    if (param.positional) continue;
    const name = flagName(key, param);
    if (param.kind === 'secret') {
      const value = await readSecret(name, invocation.options, session, help);
      if (value !== undefined) raw.set(key, [value]);
      continue;
    }
    const value = invocation.options[name];
    if (value === undefined) continue;
    raw.set(key, (Array.isArray(value) ? value : [value]).map(String));
  }
  return raw;
}

async function readSecret(name: string, options: Invocation['options'], session: Session, help: string) {
  if (options[`${name}-stdin`] === true) {
    if (process.stdin.isTTY) {
      throw new CliError('usage', `--${name}-stdin reads standard input, which is a terminal here`, help);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  const variable = options[`${name}-env`];
  if (typeof variable === 'string') {
    const value = session.config.env[variable];
    if (value === undefined) throw new CliError('usage', `Environment variable ${variable} is not set`, help);
    return value.trim();
  }
  return undefined;
}

async function resolveRaw(param: ParamSpec, raws: readonly string[], scope: Scope) {
  if (param.kind === 'select') {
    const choices = (await param.choices?.(scope)) ?? [];
    const chosen = raws.map((raw) => match(param, choices, raw));
    return param.multiple ? [...new Set(chosen.map((choice) => choice.value))] : chosen[0]?.value;
  }
  const parse = param.parse ?? ((raw: string) => raw);
  if (param.multiple) return raws.map((raw) => parse(raw));
  return parse(raws[0] ?? '');
}

/** The option a raw string names: by exact key, else by a key that differs only in case. */
function match(param: ParamSpec, choices: readonly Choice<unknown>[], raw: string) {
  let found = choices.filter((choice) => choice.keys.includes(raw));
  if (!found.length) {
    const lower = raw.toLowerCase();
    found = choices.filter((choice) => choice.keys.some((key) => key.toLowerCase() === lower));
  }
  const noun = param.placeholder ?? 'value';
  if (found.length > 1) throw new ParamError(`"${raw}" matches more than one ${noun}`);
  const [choice] = found;
  if (!choice) {
    const accepted = choices.filter((item) => !item.disabled).map((item) => item.keys[0] ?? item.label);
    const known = accepted.length && accepted.length <= 12 ? `; expected one of ${accepted.join(', ')}` : '';
    throw new ParamError(`no ${noun} "${raw}"${known}`, 'not_found');
  }
  if (choice.disabled) throw new ParamError(`${choice.label}: ${choice.disabled}`, 'precondition_failed');
  return choice;
}

/** The first key of each option the raw strings named, so equivalent commands use one spelling. */
async function keysOf(param: ParamSpec, raws: readonly string[], scope: Scope) {
  const choices = (await param.choices?.(scope)) ?? [];
  return raws.map((raw) => {
    const choice = match(param, choices, raw);
    return choice.keys[0] ?? raw;
  });
}

function describeMissing(key: string, param: ParamSpec) {
  if (param.positional) return `<${param.placeholder ?? key}${param.multiple ? '...' : ''}>`;
  if (param.kind === 'secret') {
    const name = flagName(key, param);
    return `${param.summary.toLowerCase()} (--${name}-stdin or --${name}-env)`;
  }
  return `--${flagName(key, param)}`;
}

function equivalent(
  path: readonly string[],
  params: readonly [string, ParamSpec][],
  written: ReadonlyMap<string, string[]>,
  confirmedFlags: ReadonlySet<string>,
  confirmedYes: boolean,
) {
  const words = ['oms', ...path];
  for (const [key, param] of params) {
    if (param.positional) words.push(...(written.get(key) ?? []).map(shellQuote));
  }
  for (const [key, param] of params) {
    if (param.positional) continue;
    const name = flagName(key, param);
    if (param.kind === 'flag') {
      if (written.has(key) || confirmedFlags.has(key)) words.push(`--${name}`);
    } else if (param.kind === 'secret') {
      if (written.has(key)) words.push(`--${name}-stdin`);
    } else {
      for (const raw of written.get(key) ?? []) words.push(`--${name}`, shellQuote(raw));
    }
  }
  if (confirmedYes) words.push('--yes');
  return words.join(' ');
}

function report(error: CliError, out: Output, json: boolean) {
  const code = exitCodes[error.kind];
  if (json) {
    process.stderr.write(`${JSON.stringify({ error: { kind: error.kind, message: error.message } })}\n`);
    return code;
  }
  if (error instanceof Cancelled) out.hint('Cancelled.');
  else out.error(error.message);
  if (error.hint) out.hint(error.hint);
  return code;
}
