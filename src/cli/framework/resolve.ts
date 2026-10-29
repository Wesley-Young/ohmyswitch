import type { Choice, ParamSpec, Scope, Session } from './command.ts';
import { ParamError } from './errors.ts';
import { withProgress } from './progress.ts';

/** The scope parameter hooks see while a command's parameters resolve into `values`. */
export function createScope(session: Session, values: Record<string, unknown>): Scope {
  const memos = new Map<string, Promise<unknown>>();
  return {
    session,
    services: () => session.services(),
    values,
    memo<T>(key: string, compute: () => Promise<T>) {
      if (!memos.has(key)) memos.set(key, compute());
      return memos.get(key) as Promise<T>;
    },
    memoized: <T>(key: string) => memos.get(key) as Promise<T> | undefined,
    progress: (task) => withProgress(session.progress, task),
  };
}

/**
 * The value of raw command-line strings, and how to write them in the equivalent command: as given, or for a
 * select by the first key of each option named, so it uses one spelling.
 */
export async function resolveRaw(param: ParamSpec, raws: readonly string[], scope: Scope) {
  if (param.kind === 'select') {
    const choices = (await param.choices?.(scope)) ?? [];
    const chosen = [...new Set(raws.map((raw) => match(param, choices, raw)))];
    const written = chosen.map((choice) => choice.keys[0] ?? choice.label);
    return { value: param.multiple ? chosen.map((choice) => choice.value) : chosen[0]?.value, written };
  }
  const parse = param.parse ?? ((raw: string) => raw);
  const value = param.multiple ? raws.map((raw) => parse(raw)) : parse(raws[0] ?? '');
  return { value, written: [...raws] };
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
    const accepted = choices.flatMap((item) => (item.disabled || !item.keys[0] ? [] : [item.keys[0]]));
    const known = accepted.length && accepted.length <= 12 ? `; expected one of ${accepted.join(', ')}` : '';
    throw new ParamError(`no ${noun} "${raw}"${known}`, 'not_found');
  }
  if (choice.disabled) throw new ParamError(`${choice.label}: ${choice.disabled}`, 'precondition_failed');
  return choice;
}
