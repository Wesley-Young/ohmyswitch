import { columns } from './text.ts';

import { styleText } from 'node:util';

type Style = Parameters<typeof styleText>[0];

/**
 * What commands print. Results go to stdout; warnings, errors and hints go to stderr, so stdout stays usable in
 * pipes. Colors follow each stream: none when it is not a terminal, or with `NO_COLOR`.
 */
export class Output {
  private readonly stdout: NodeJS.WriteStream;
  private readonly stderr: NodeJS.WriteStream;

  constructor(stdout: NodeJS.WriteStream = process.stdout, stderr: NodeJS.WriteStream = process.stderr) {
    this.stdout = stdout;
    this.stderr = stderr;
  }

  print(text = '') {
    this.stdout.write(`${text}\n`);
  }

  /** A table with a dimmed header row. */
  table(header: readonly string[], rows: readonly (readonly string[])[]) {
    const [head, ...body] = columns([header, ...rows]);
    this.print(this.paint('dim', head ?? ''));
    for (const line of body) this.print(line);
  }

  /** Labeled values, one per line. Missing values are left out. */
  fields(pairs: readonly (readonly [string, string | undefined])[]) {
    const present = pairs.filter((pair): pair is readonly [string, string] => pair[1] !== undefined);
    for (const line of columns(present.map(([label, value]) => [this.paint('dim', label), value]))) {
      this.print(line);
    }
  }

  success(text: string) {
    this.print(`${this.paint('green', '✔')} ${text}`);
  }

  warn(text: string) {
    this.stderr.write(`${this.paint('yellow', '!', this.stderr)} ${text}\n`);
  }

  error(text: string) {
    this.stderr.write(`${this.paint('red', '✖', this.stderr)} ${text}\n`);
  }

  hint(text: string) {
    this.stderr.write(`${this.paint('dim', text, this.stderr)}\n`);
  }

  json(value: unknown) {
    this.print(JSON.stringify(value ?? null, null, 2));
  }

  /** Style text for the stream it is written to. */
  paint(style: Style, text: string, stream: NodeJS.WriteStream = this.stdout) {
    return styleText(style, text, { stream });
  }
}
