import { findChild, type Globals, globalByToken, globalOptions } from './argv.ts';
import {
  type Choice,
  type Command,
  command,
  flagName,
  type Group,
  type Node,
  type ParamSpec,
  type Params,
  type Session,
  select,
} from './command.ts';
import { createScope, resolveRaw } from './resolve.ts';
import { listing } from './text.ts';

import { basename } from 'node:path';

/**
 * The hidden command the completion scripts run on each Tab: `oms __complete <word...>`, with the words after the
 * program name up to the one being completed, which may be empty. It prints one candidate per line, as
 * `<value>\t<description>`, and nothing when it has none to offer.
 */
export const completeRequest = '__complete';

/** The names the CLI is installed under. */
const programs = ['oms', 'ohmyswitch'];

interface Candidate {
  value: string;
  description?: string;
}

/** Where the value after an option goes: a parameter, the name of an environment variable, or nowhere. */
type Slot = { kind: 'param'; key: string; param: ParamSpec } | { kind: 'env' } | { kind: 'none' };

interface OptionToken {
  /** The long form, which is the one offered. */
  name: string;
  summary: string;
  slot: Slot;
  takesValue: boolean;
  repeatable: boolean;
}

const none: Slot = { kind: 'none' };

const globalTokens = () =>
  Object.entries(globalOptions).map(
    ([name, option]): OptionToken => ({
      name: `--${name}`,
      summary: option.summary,
      slot: none,
      takesValue: false,
      repeatable: false,
    }),
  );

/** Every option a command accepts, by each spelling, the command's own before the global ones. */
function optionTokens(command: Command) {
  const tokens = new Map<string, OptionToken>();
  for (const [key, param] of Object.entries(command.params as Params)) {
    if (param.positional) continue;
    const name = flagName(key, param);
    if (param.kind === 'secret') {
      const summary = param.summary;
      tokens.set(`--${name}-stdin`, {
        name: `--${name}-stdin`,
        summary: `${summary}, read from standard input`,
        slot: none,
        takesValue: false,
        repeatable: false,
      });
      tokens.set(`--${name}-env`, {
        name: `--${name}-env`,
        summary: `${summary}, read from an environment variable`,
        slot: { kind: 'env' },
        takesValue: true,
        repeatable: false,
      });
      continue;
    }
    const token: OptionToken = {
      name: `--${name}`,
      summary: param.summary,
      slot: { kind: 'param', key, param },
      takesValue: param.kind !== 'flag',
      repeatable: param.multiple,
    };
    tokens.set(token.name, token);
    if (param.short) tokens.set(`-${param.short}`, token);
  }
  const globals = new Map(globalTokens().map((token) => [token.name.slice(2), token]));
  for (const [spelling, name] of globalByToken) tokens.set(spelling, globals.get(name) as OptionToken);
  return tokens;
}

/** Nothing may prompt or draw on the terminal while the shell waits for candidates; `json` turns off spinners. */
const quiet: Globals = { json: true, 'no-input': true, yes: false, verbose: false, help: false, version: false };

/** The candidates for the last of `words`, as the lines `oms __complete` prints. */
export async function completions(
  root: Group,
  words: readonly string[],
  session: (globals: Globals) => Session,
): Promise<string[]> {
  const current = words.at(-1) ?? '';
  const before = words.slice(0, -1);
  let node: Node = root;
  let index = 0;
  while (node.type === 'group' && index < before.length) {
    const word = before[index] as string;
    index++;
    if (globalByToken.has(word) || (word === 'help' && !findChild(node, word))) continue;
    const child = findChild(node, word);
    if (!child) return [];
    node = child;
  }
  let candidates: Candidate[];
  if (node.type === 'command') {
    candidates = await completeCommand(node, before.slice(index), current, session);
  } else if (current.startsWith('-')) {
    candidates = globalTokens().map((token) => ({ value: token.name, description: token.summary }));
  } else {
    candidates = node.children.map((child) => ({ value: child.name, description: child.summary }));
  }
  const prefix = current.toLowerCase();
  return candidates
    .filter((candidate) => candidate.value.toLowerCase().startsWith(prefix) && !/[\t\n]/.test(candidate.value))
    .map(({ value, description }) => (description ? `${value}\t${description.replace(/\s+/g, ' ')}` : value));
}

/** Follow the words after a command's name, then offer what may come next: an option, its value, or a positional. */
async function completeCommand(
  command: Command,
  words: readonly string[],
  current: string,
  makeSession: (globals: Globals) => Session,
): Promise<Candidate[]> {
  const options = optionTokens(command);
  const params = Object.entries(command.params as Params);
  /** Raw strings given so far, by parameter key; flags given are present with none. */
  const raw = new Map<string, string[]>();
  const given = new Set<OptionToken>();
  const positionals: string[] = [];
  const record = (slot: Slot, value?: string) => {
    if (slot.kind !== 'param') return;
    const values = raw.get(slot.key) ?? [];
    if (value !== undefined) values.push(value);
    raw.set(slot.key, values);
  };
  let pending: OptionToken | undefined;
  let rest = false;
  for (const word of words) {
    if (pending) {
      record(pending.slot, word);
      pending = undefined;
    } else if (rest || !word.startsWith('-') || word === '-') {
      positionals.push(word);
    } else if (word === '--') {
      rest = true;
    } else {
      const [spelling = word, inline] = word.startsWith('--') && word.includes('=') ? splitOnce(word, '=') : [word];
      const option = options.get(spelling);
      if (!option) continue;
      given.add(option);
      if (!option.takesValue) record(option.slot);
      else if (inline !== undefined) record(option.slot, inline);
      else pending = option;
    }
  }

  /** The positional parameter a new word would fill; a repeatable one keeps taking them. */
  let nextPositional: Slot | undefined;
  let used = 0;
  for (const [key, param] of params) {
    if (!param.positional) continue;
    if (param.multiple) {
      raw.set(key, positionals.slice(used));
      nextPositional = { kind: 'param', key, param };
      break;
    }
    const word = positionals[used];
    if (word === undefined) {
      nextPositional = { kind: 'param', key, param };
      break;
    }
    raw.set(key, [word]);
    used++;
  }

  if (!pending && !rest && current.startsWith('-')) {
    if (current.includes('=')) return [];
    return [...new Set(options.values())]
      .filter((option) => option.repeatable || !given.has(option))
      .map((option) => ({ value: option.name, description: option.summary }));
  }
  const slot = pending ? pending.slot : nextPositional;
  if (!slot || slot.kind === 'none') return [];
  if (slot.kind === 'env')
    return Object.keys(makeSession(quiet).config.env)
      .toSorted()
      .map((value) => ({ value }));

  const { key, param } = slot;
  const source = param.complete ?? (param.kind === 'select' ? param.choices : undefined);
  if (!source) return [];
  const session = makeSession(quiet);
  try {
    // Hooks see the parameters declared before theirs, as when the command runs; any that do not resolve stay unset.
    const values: Record<string, unknown> = {};
    const scope = createScope(session, values);
    for (const [earlierKey, earlier] of params) {
      if (earlierKey === key) break;
      const raws = raw.get(earlierKey);
      if (earlier.kind === 'flag') {
        values[earlierKey] = raws !== undefined;
        continue;
      }
      values[earlierKey] = earlier.multiple ? [] : undefined;
      // Resolving a select calls its choices, which are too slow here when it opts out of completion.
      if (!raws?.length || (earlier.kind === 'select' && earlier.complete === false)) continue;
      try {
        values[earlierKey] = (await resolveRaw(earlier, raws, scope)).value;
      } catch {}
    }
    const taken = new Set((param.multiple ? (raw.get(key) ?? []) : []).map((word) => word.toLowerCase()));
    return (await source(scope)).flatMap((choice) => {
      if (choice.disabled || choice.keys.some((choiceKey) => taken.has(choiceKey.toLowerCase()))) return [];
      const candidate = candidateOf(choice, current);
      return candidate ? [candidate] : [];
    });
  } catch {
    return [];
  } finally {
    await session.reset();
  }
}

function splitOnce(text: string, separator: string): [string, string] {
  const index = text.indexOf(separator);
  return [text.slice(0, index), text.slice(index + separator.length)];
}

/** An option offered by the first of its keys that the typed prefix fits, so names and ids both complete. */
function candidateOf(choice: Choice<unknown>, current: string): Candidate | undefined {
  const prefix = current.toLowerCase();
  const value =
    choice.keys.find((key) => key.startsWith(current)) ??
    choice.keys.find((key) => key.toLowerCase().startsWith(prefix));
  if (value === undefined) return undefined;
  const notes = [choice.label, choice.hint].filter((note) => note && note !== value);
  return { value, description: notes.join(' — ') || undefined };
}

// The scripts pass the words before the cursor to `oms __complete` and offer what it prints, in that order, never
// falling back to file names.

const zshScript = `#compdef ${programs.join(' ')}

_oms() {
  local -a lines candidates
  local line
  lines=("\${(@f)$("\${words[1]}" ${completeRequest} "\${(@Q)words[2,CURRENT]}" 2>/dev/null)}")
  for line in "\${lines[@]}"; do
    [[ -n $line ]] || continue
    if [[ $line == *$'\\t'* ]]; then
      candidates+=("\${\${line%%$'\\t'*}//:/\\\\:}:\${line#*$'\\t'}")
    else
      candidates+=("\${line//:/\\\\:}")
    fi
  done
  (( \${#candidates} )) && _describe -V oms candidates
}

if [[ \${funcstack[1]} == _oms ]]; then
  _oms "$@"
else
  compdef _oms ${programs.join(' ')}
fi`;

const bashScript = `__oms_dequote() {
  case $1 in
    \\'*) local word=\${1#\\'}; printf '%s' "\${word%\\'}" ;;
    \\"*) local word=\${1#\\"}; printf '%s' "\${word%\\"}" ;;
    *) printf '%s' "\${1//\\\\/}" ;;
  esac
}

_oms() {
  local cur words cword word line
  local -a args=() lines=()
  if declare -F _get_comp_words_by_ref >/dev/null 2>&1; then
    _get_comp_words_by_ref -n =: cur words cword
  else
    words=("\${COMP_WORDS[@]}")
    cword=$COMP_CWORD
    cur=\${words[cword]}
  fi
  for word in "\${words[@]:1:cword}"; do
    args+=("$(__oms_dequote "$word")")
  done
  local IFS=$'\\n'
  lines=($("\${words[0]}" ${completeRequest} "\${args[@]}" 2>/dev/null))
  COMPREPLY=()
  for line in "\${lines[@]}"; do
    line=\${line%%$'\\t'*}
    case $cur in
      [\\'\\"]*) COMPREPLY+=("$line") ;;
      *) COMPREPLY+=("$(printf '%q' "$line")") ;;
    esac
  done
  if declare -F __ltrim_colon_completions >/dev/null 2>&1; then
    __ltrim_colon_completions "$cur"
  fi
}

complete -o nosort -F _oms ${programs.join(' ')} 2>/dev/null || complete -F _oms ${programs.join(' ')}`;

const fishScript = `function __oms_complete
    set -l tokens (commandline -opc)
    set -l program $tokens[1]
    set -e tokens[1]
    $program ${completeRequest} $tokens (commandline -ct) 2>/dev/null
end

${programs.map((program) => `complete -c ${program} -f -k -a '(__oms_complete)'`).join('\n')}`;

const shells = {
  zsh: { script: zshScript, rc: '~/.zshrc', load: 'eval "$(oms completion zsh)"' },
  bash: { script: bashScript, rc: '~/.bashrc', load: 'eval "$(oms completion bash)"' },
  fish: { script: fishScript, rc: '~/.config/fish/config.fish', load: 'oms completion fish | source' },
};

type Shell = keyof typeof shells;

const shellNames = Object.keys(shells) as Shell[];

const isShell = (name: string): name is Shell => Object.hasOwn(shells, name);

/** `oms completion <shell>`: print the script that makes the shell complete commands, options and their values. */
export const completion = command({
  name: 'completion',
  summary: 'Print the shell completion script',
  params: {
    shell: select({
      summary: 'Shell',
      positional: true,
      placeholder: 'shell',
      details: `One of ${listing(shellNames)}`,
      choices: () => shellNames.map((shell) => ({ value: shell, keys: [shell], label: shell, hint: shells[shell].rc })),
      initial: (scope) => {
        const name = basename(scope.session.config.env.SHELL ?? '');
        return isShell(name) ? name : undefined;
      },
    }),
  },
  run: ({ shell }) => shells[shell].script,
  render(script, out, { shell }) {
    out.print(script);
    // Printed into a terminal rather than piped or evaluated: say how to load it.
    if (process.stdout.isTTY)
      out.hint(`To load it in every shell, add this line to ${shells[shell].rc}:\n  ${shells[shell].load}`);
  },
});
