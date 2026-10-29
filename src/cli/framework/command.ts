import type { Context } from 'cordis';

import type { CliConfig } from '#cli/config.ts';
import type { Output } from './output.ts';
import type { Stage } from './progress.ts';

/** The state of one CLI run, shared by every command it executes. */
export interface Session {
  readonly config: CliConfig;
  readonly out: Output;
  /** Prompts may fill in what the command line left out. */
  readonly interactive: boolean;
  /** Results are printed as JSON, and nothing prompts. */
  readonly json: boolean;
  /** Irreversible operations are confirmed in advance. */
  readonly yes: boolean;
  /** Slow steps show a spinner on stderr. */
  readonly progress: boolean;
  /** The core services, started on first use. */
  services(): Promise<Context>;
  /** Stop the services, so the next command reads every file afresh. */
  reset(): Promise<void>;
}

/** One option of a select parameter. The command line accepts it by any of its keys, the prompt lists it. */
export interface Choice<T> {
  value: T;
  /** Spellings accepted on the command line, such as a name and an id; the first is used in equivalent commands. */
  keys: readonly string[];
  label: string;
  hint?: string;
  /** Why it cannot be chosen now. It is still listed, so the user sees why. */
  disabled?: string;
}

/** What parameter hooks can see: the services, and the parameters resolved before this one. */
export interface Scope {
  readonly session: Session;
  services(): Promise<Context>;
  readonly values: Readonly<Record<string, unknown>>;
  /**
   * Compute something once per command run, such as a provider's model list that both a parameter's choices and
   * `run` need: later calls with the same key get the first result.
   */
  memo<T>(key: string, compute: () => Promise<T>): Promise<T>;
  /** What `memo` computed for the key so far, without computing it: undefined when nothing asked for it yet. */
  memoized<T>(key: string): Promise<T> | undefined;
  /** Run a slow task, showing each stage it reports in a spinner while it runs. */
  progress<T>(task: (stage: Stage) => Promise<T>): Promise<T>;
}

/** What a command's `run` can do beyond reading its parameters. */
export interface RunScope extends Scope {
  readonly out: Output;
  /**
   * Ask to go ahead with something the command found it needs, such as taking over an existing entry. `flag`
   * names the boolean parameter that answers it on the command line: when set, this returns true without asking;
   * without a terminal, false.
   */
  confirm(message: string, flag: string): Promise<boolean>;
}

export type ParamKind = 'text' | 'secret' | 'list' | 'select' | 'flag';

export type ParamValues = Readonly<Record<string, unknown>>;

/** Values a list parameter offers when prompting, to pick instead of type. */
export interface Suggestions {
  /** The values to offer, as their raw strings, which `parse` takes. */
  choices: readonly Choice<string>[];
  /** Values ticked to begin with. */
  ticked?: readonly string[];
  /**
   * A flag parameter that means "all of them": when every choice is picked, the answer is that flag instead of the
   * whole list, so the equivalent command stays short.
   */
  all?: string;
}

/** The runtime description of a parameter; the builders below fill in defaults and carry the value type. */
export interface ParamSpec {
  kind: ParamKind;
  /** Help text, and the question when prompting. */
  summary: string;
  positional: boolean;
  /** The option name, by default the kebab-cased key. */
  flag?: string;
  short?: string;
  /** What the value is, in help and errors: `<provider>`, `--name <name>`. */
  placeholder?: string;
  /** Extra help, such as the accepted values. */
  details?: string;
  optional: boolean;
  /** For optional parameters: whether a value is needed after all, given the parameters before it. */
  requiredWhen?: (values: ParamValues) => boolean;
  /**
   * Whether prompting may ask for it, possibly depending on the parameters before it. Flags are never asked;
   * commands confirm through `RunScope.confirm`.
   */
  ask: boolean | ((values: ParamValues) => boolean);
  multiple: boolean;
  /** Text, list items and secrets: turn the raw string into the value, throwing a ParamError. */
  parse?: (raw: string) => unknown;
  /** Selects: the options, in display order. */
  choices?: (scope: Scope) => Promise<readonly Choice<unknown>[]> | readonly Choice<unknown>[];
  /** Selects: what to say when there is nothing to choose. */
  empty?: string;
  /** The value shown when prompting: a raw string for text, a value for selects. Keeping it changes nothing. */
  initial?: (scope: Scope) => unknown;
  /** Text: a placeholder in the prompt. */
  hint?: string;
  /**
   * Lists: values to pick from when prompting. If getting them fails, the failure is shown and the values are
   * typed instead. The command line still takes any value `parse` accepts.
   */
  suggest?: (scope: Scope) => Promise<Suggestions>;
  /**
   * What shell completion offers, by each option's keys. Selects offer their `choices` unless this is false, as it
   * should be when getting them is slow, such as over the network; other kinds offer nothing unless given this.
   */
  complete?: false | ((scope: Scope) => Promise<readonly Choice<unknown>[]> | readonly Choice<unknown>[]);
}

/** A parameter whose resolved value has type `V`. */
export interface Param<V> extends ParamSpec {
  readonly __value?: V;
}

export type Params = Record<string, Param<unknown>>;

export type Values<P extends Params> = { [K in keyof P]: P[K] extends Param<infer V> ? V : never };

interface CommonOptions {
  summary: string;
  positional?: boolean;
  flag?: string;
  short?: string;
  placeholder?: string;
  details?: string;
  ask?: ParamSpec['ask'];
  complete?: ParamSpec['complete'];
}

type Requirement = { optional?: false } | { optional: true; requiredWhen?: ParamSpec['requiredWhen'] };

const base = (kind: ParamKind, options: CommonOptions & Requirement) => ({
  kind,
  positional: false,
  optional: false,
  ask: true,
  multiple: false,
  ...options,
});

interface TextOptions<T> extends CommonOptions {
  parse?: (raw: string) => T;
  initial?: (scope: Scope) => string | undefined | Promise<string | undefined>;
  hint?: string;
}

/** A single string, as an option or positional argument. */
export function text<T = string>(options: TextOptions<T> & { optional?: false }): Param<T>;
export function text<T = string>(
  options: TextOptions<T> & { optional: true; requiredWhen?: ParamSpec['requiredWhen'] },
): Param<T | undefined>;
export function text(options: TextOptions<unknown> & Requirement): ParamSpec {
  return { parse: (raw: string) => raw, ...base('text', options) };
}

/**
 * Repeatable strings: `--model a --model b`. When prompting, picked from `suggest` when it offers any, otherwise a
 * comma-separated answer. Unset is empty.
 */
export function textList<T = string>(
  options: TextOptions<T> & { optional: true; suggest?: ParamSpec['suggest'] },
): Param<T[]> {
  return { parse: (raw: string) => raw, ...base('list', options), multiple: true };
}

/**
 * A secret such as an API key. It never appears on the command line: it is read with `--<flag>-stdin` or
 * `--<flag>-env <var>`, or typed into a masked prompt.
 */
export function secret(
  options: Omit<TextOptions<string>, 'initial' | 'complete'> & { optional?: false },
): Param<string>;
export function secret(
  options: Omit<TextOptions<string>, 'initial' | 'complete'> & { optional: true },
): Param<string | undefined>;
export function secret(options: TextOptions<unknown> & Requirement): ParamSpec {
  return { parse: (raw: string) => raw, ...base('secret', options) };
}

interface SelectOptions<T> extends CommonOptions {
  choices: (scope: Scope) => Promise<readonly Choice<T>[]> | readonly Choice<T>[];
  empty?: string;
  initial?: (scope: Scope) => T | undefined | Promise<T | undefined>;
}

/** One of a set of options, matched by key on the command line and picked from a list when prompting. */
export function select<T>(options: SelectOptions<T> & { optional?: false }): Param<T>;
export function select<T>(
  options: SelectOptions<T> & { optional: true; requiredWhen?: ParamSpec['requiredWhen'] },
): Param<T | undefined>;
export function select(options: SelectOptions<unknown> & Requirement): ParamSpec {
  return base('select', options);
}

/** Several of a set of options. Unset is empty; when required, at least one. */
export function selectMany<T>(
  options: Omit<SelectOptions<T>, 'initial'> & {
    /** The options ticked when prompting. */
    initial?: (scope: Scope) => readonly T[] | undefined | Promise<readonly T[] | undefined>;
  } & ({ optional?: false } | { optional: true; requiredWhen?: ParamSpec['requiredWhen'] }),
): Param<T[]> {
  return { ...base('select', options), multiple: true };
}

/** A boolean switch, false unless given. */
export function flag(options: Omit<CommonOptions, 'positional' | 'placeholder' | 'ask' | 'complete'>): Param<boolean> {
  return { ...base('flag', { ...options, optional: true }), ask: false };
}

export interface CommandSpec<P extends Params, R> {
  name: string;
  aliases?: readonly string[];
  summary: string;
  params: P;
  /** A confirmation to ask before running, for irreversible operations; `--yes` gives it in advance. */
  confirm?: (values: Values<P>, scope: Scope) => string | undefined | Promise<string | undefined>;
  run: (values: Values<P>, scope: RunScope) => R | Promise<R>;
  /** Print the result for people; `--json` prints the result itself instead. */
  render?: (result: Awaited<R>, out: Output, values: Values<P>) => void;
  /** Whether the result reports a partial failure, which makes the exit status non-zero. */
  failed?: (result: Awaited<R>) => boolean;
}

export interface Command extends CommandSpec<Params, unknown> {
  type: 'command';
}

export interface Group {
  type: 'group';
  name: string;
  aliases?: readonly string[];
  summary: string;
  children: readonly Node[];
}

export type Node = Command | Group;

export function command<P extends Params, R>(spec: CommandSpec<P, R>): Command {
  return { type: 'command', ...(spec as unknown as CommandSpec<Params, unknown>) };
}

export function group(spec: Omit<Group, 'type'>): Group {
  return { type: 'group', ...spec };
}

/** The option name of a parameter. */
export const flagName = (key: string, param: ParamSpec) =>
  param.flag ?? key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** How a parameter is named in usage lines and errors. */
export function paramLabel(key: string, param: ParamSpec) {
  if (param.positional) {
    const name = `${param.placeholder ?? key}${param.multiple ? '...' : ''}`;
    return param.optional ? `[${name}]` : `<${name}>`;
  }
  return `--${flagName(key, param)}`;
}
