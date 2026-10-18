import * as prompts from '@clack/prompts';

import type { Choice, ParamSpec, Scope, Suggestions } from './command.ts';
import { Cancelled, CliError, ParamError, toCliError } from './errors.ts';

import { emitKeypressEvents } from 'node:readline';

// Prompts are drawn without clack's guide line, so they line up with what commands print between them.
prompts.updateSettings({ withGuide: false });

/** The value a prompt produced, and how it would be written on the command line. */
export interface Answer {
  value: unknown;
  /** Raw text for text parameters; the first key of each chosen option for selects. */
  raws: string[];
  /** A flag parameter the answer amounts to, such as "all of them" (`Suggestions.all`); `value` is then unused. */
  flag?: string;
}

const unchanged: Answer = { value: undefined, raws: [] };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Whether Ctrl-C was pressed during the current prompt. */
let interrupted = false;

const watchInterrupt = (_text: string | undefined, key: { ctrl?: boolean; name?: string } | undefined) => {
  if (key?.ctrl && key.name === 'c') interrupted = true;
};

/**
 * Show a prompt and return its answer. clack reports Esc and Ctrl-C alike as a cancel; the keys are watched
 * alongside it so the cancel says which one it was: Esc backs out of one step, Ctrl-C ends the CLI.
 */
async function prompted<R>(show: () => Promise<R>): Promise<Exclude<R, symbol>> {
  interrupted = false;
  emitKeypressEvents(process.stdin);
  process.stdin.on('keypress', watchInterrupt);
  try {
    const result = await show();
    if (prompts.isCancel(result)) throw new Cancelled(interrupted);
    return result as Exclude<R, symbol>;
  } finally {
    process.stdin.off('keypress', watchInterrupt);
  }
}

/** Run `parse` for a prompt's validation, returning the problem as the prompt shows it. */
function problemOf(parse: () => unknown) {
  try {
    parse();
    return undefined;
  } catch (error) {
    if (error instanceof ParamError) return capitalize(error.message);
    throw error;
  }
}

const parseRaw = (param: ParamSpec, raw: string) => (param.parse ? param.parse(raw) : raw);

const splitList = (raw: string) =>
  raw
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Ask for one parameter. An optional parameter left empty stays unset; one with an initial value that is kept
 * also stays unset, since keeping it changes nothing.
 */
export async function ask(param: ParamSpec, required: boolean, scope: Scope): Promise<Answer> {
  switch (param.kind) {
    case 'text': {
      const initial = (await param.initial?.(scope)) as string | undefined;
      const skips = (raw: string) => !required && raw === (initial ?? '');
      const raw = await prompted(() =>
        prompts.text({
          message: param.summary,
          placeholder: param.hint,
          initialValue: initial,
          validate: (value) => {
            const raw = value ?? '';
            if (skips(raw)) return undefined;
            return problemOf(() => parseRaw(param, raw));
          },
        }),
      );
      const value = raw ?? '';
      if (skips(value)) return unchanged;
      return { value: parseRaw(param, value), raws: [value] };
    }
    case 'secret': {
      const raw = await prompted(() =>
        prompts.password({
          message: required ? param.summary : `${param.summary} (leave empty to keep)`,
          validate: (value) => {
            const raw = value ?? '';
            if (raw === '' && !required) return undefined;
            return problemOf(() => parseRaw(param, raw));
          },
        }),
      );
      if (!raw && !required) return unchanged;
      return { value: parseRaw(param, raw ?? ''), raws: [''] };
    }
    case 'list': {
      const suggested = await suggestionsOf(param, scope);
      if (suggested) return askSuggested(param, required, suggested);
      const raw = await prompted(() =>
        prompts.text({
          message: `${param.summary} (comma-separated)`,
          placeholder: param.hint,
          validate: (value) => problemOf(() => splitList(value ?? '').map((item) => parseRaw(param, item))),
        }),
      );
      const items = splitList(raw ?? '');
      return { value: items.map((item) => parseRaw(param, item)), raws: items };
    }
    case 'select':
      return param.multiple ? askMany(param, required, scope) : askOne(param, required, scope);
    case 'flag':
      return { value: false, raws: [] };
  }
}

/** Lists longer than this can be filtered by typing, like the GUI's model picker with its search box. */
const filterableFrom = 12;

/**
 * The options to show, or undefined when an optional parameter has none to offer, which leaves it unset. A
 * required one with nothing to choose cannot go on.
 */
async function choicesOf(param: ParamSpec, required: boolean, scope: Scope) {
  const choices = (await param.choices?.(scope)) ?? [];
  if (choices.some((choice) => !choice.disabled)) return choices;
  if (!required) return undefined;
  throw new CliError('precondition_failed', param.empty ?? `There is nothing to choose for "${param.summary}"`);
}

const optionOf = (choice: Choice<unknown>, index: number) => ({
  value: index,
  label: choice.label,
  hint: choice.disabled ?? choice.hint,
  disabled: Boolean(choice.disabled),
});

async function askOne(param: ParamSpec, required: boolean, scope: Scope): Promise<Answer> {
  const choices = await choicesOf(param, required, scope);
  if (!choices) return unchanged;
  const initial = await param.initial?.(scope);
  const initialIndex = choices.findIndex((choice) => choice.value === initial);
  const skip = -1;
  const options = choices.map(optionOf);
  if (!required && initialIndex < 0) options.push({ value: skip, label: 'Skip', hint: undefined, disabled: false });
  const initialValue = initialIndex >= 0 ? initialIndex : undefined;
  const index = await prompted(() =>
    options.length > filterableFrom
      ? prompts.autocomplete({ message: param.summary, options, initialValue, placeholder: 'Type to filter' })
      : prompts.select({ message: param.summary, options, initialValue }),
  );
  if (index === skip || index === initialIndex) return unchanged;
  const choice = choices[index] as Choice<unknown>;
  return { value: choice.value, raws: [choice.keys[0] ?? choice.label] };
}

async function askMany(param: ParamSpec, required: boolean, scope: Scope): Promise<Answer> {
  const choices = await choicesOf(param, required, scope);
  if (!choices) return unchanged;
  const initial = ((await param.initial?.(scope)) ?? []) as readonly unknown[];
  const chosen = await pickSeveral(param.summary, choices, (choice) => initial.includes(choice.value), required);
  return {
    value: chosen.map((choice) => choice.value),
    raws: chosen.map((choice) => choice.keys[0] ?? choice.label),
  };
}

/** Tick options in a list, filterable when long; returns them in list order, not the order they were ticked. */
async function pickSeveral<T>(
  message: string,
  choices: readonly Choice<T>[],
  ticked: (choice: Choice<T>) => boolean,
  required: boolean,
) {
  const options = choices.map(optionOf);
  const initialValues = choices.flatMap((choice, index) => (ticked(choice) ? [index] : []));
  for (;;) {
    const indexes = await prompted(() =>
      options.length > filterableFrom
        ? prompts.autocompleteMultiselect({
            message,
            options,
            initialValues,
            required: false,
            placeholder: 'Type to filter',
          })
        : prompts.multiselect({ message, options, initialValues, required: false }),
    );
    if (required && !indexes.length) {
      prompts.log.warn('Select at least one (space toggles an option).');
      continue;
    }
    return indexes.toSorted((a, b) => a - b).map((index) => choices[index] as Choice<T>);
  }
}

/**
 * What a list parameter offers to pick from, or undefined to type the values instead: when it offers nothing, or
 * getting the offer failed, which is shown so the user knows why.
 */
async function suggestionsOf(param: ParamSpec, scope: Scope) {
  if (!param.suggest) return undefined;
  try {
    const suggested = await param.suggest(scope);
    return suggested.choices.length ? suggested : undefined;
  } catch (error) {
    if (error instanceof Cancelled) throw error;
    scope.session.out.warn(`${toCliError(error).message.replace(/\.$/, '')}. Type them instead.`);
    return undefined;
  }
}

async function askSuggested(param: ParamSpec, required: boolean, suggested: Suggestions): Promise<Answer> {
  const ticked = new Set(suggested.ticked ?? []);
  const chosen = await pickSeveral(param.summary, suggested.choices, (choice) => ticked.has(choice.value), required);
  if (suggested.all && chosen.length === suggested.choices.length)
    return { value: undefined, raws: [], flag: suggested.all };
  const raws = chosen.map((choice) => choice.value);
  return { value: raws.map((raw) => parseRaw(param, raw)), raws };
}

/** Ask a yes/no question, no by default. */
export async function confirm(message: string) {
  return prompted(() => prompts.confirm({ message, initialValue: false }));
}

/** Pick one of a menu's entries; undefined when the user backs out with Esc. Ctrl-C throws Cancelled. */
export async function pickEntry<T>(message: string, entries: readonly { value: T; label: string; hint?: string }[]) {
  try {
    const index = await prompted(() =>
      prompts.select({
        message,
        options: entries.map((entry, index) => ({ value: index, label: entry.label, hint: entry.hint })),
      }),
    );
    return entries[index]?.value;
  } catch (error) {
    if (error instanceof Cancelled && !error.interrupted) return undefined;
    throw error;
  }
}
