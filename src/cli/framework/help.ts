import { globalOptions } from './argv.ts';
import { type Command, flagName, type Group, type Params, paramLabel } from './command.ts';
import { columns } from './text.ts';

const indent = (lines: readonly string[]) => lines.map((line) => `  ${line}`);

function globalLines() {
  return indent(
    columns(
      Object.entries(globalOptions).map(([name, option]) => [
        `${'short' in option ? `-${option.short}, ` : '    '}--${name}`,
        option.summary,
      ]),
    ),
  );
}

export function groupHelp(group: Group, path: readonly string[]) {
  const command = ['oms', ...path].join(' ');
  const lines = [`Usage: ${command} <command> [options]`, '', group.summary, '', 'Commands:'];
  lines.push(
    ...indent(
      columns(
        group.children.map((child) => [
          [child.name, ...(child.aliases ?? [])].join(', '),
          child.type === 'group' ? `${child.summary} …` : child.summary,
        ]),
      ),
    ),
  );
  lines.push('', 'Global options:', ...globalLines(), '');
  lines.push(`Run "${command} <command> --help" for details.`);
  if (!path.length) lines.push('Run "oms" without a command in a terminal to pick one from a menu.');
  return lines.join('\n');
}

export function commandHelp(command: Command, path: readonly string[]) {
  const params = Object.entries(command.params as Params);
  const positionals = params.filter(([, param]) => param.positional);
  const options = params.filter(([, param]) => !param.positional);
  const usage = ['oms', ...path, ...positionals.map(([key, param]) => paramLabel(key, param))];
  if (options.length) usage.push('[options]');
  const lines = [`Usage: ${usage.join(' ')}`, '', command.summary];
  if (command.aliases?.length) lines.push(`Aliases: ${command.aliases.join(', ')}`);
  if (positionals.length) {
    lines.push('', 'Arguments:');
    lines.push(
      ...indent(
        columns(positionals.map(([key, param]) => [paramLabel(key, param), describe(param.summary, param.details)])),
      ),
    );
  }
  if (options.length) {
    lines.push('', 'Options:');
    const rows: string[][] = [];
    for (const [key, param] of options) {
      const name = flagName(key, param);
      const short = param.short ? `-${param.short}, ` : '    ';
      const value = param.placeholder ?? name;
      const required = param.optional ? '' : ' (required)';
      if (param.kind === 'secret') {
        rows.push([`    --${name}-stdin`, `${param.summary}, read from standard input${required}`]);
        rows.push([`    --${name}-env <var>`, `${param.summary}, read from an environment variable`]);
      } else if (param.kind === 'flag') {
        rows.push([`${short}--${name}`, describe(param.summary, param.details)]);
      } else {
        const repeat = param.multiple ? ' (repeatable)' : '';
        rows.push([`${short}--${name} <${value}>`, describe(`${param.summary}${required}${repeat}`, param.details)]);
      }
    }
    lines.push(...indent(columns(rows)));
  }
  lines.push('', 'Global options:', ...globalLines());
  return lines.join('\n');
}

const describe = (summary: string, details: string | undefined) => (details ? `${summary}. ${details}` : summary);
