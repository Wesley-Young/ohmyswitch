import { stripVTControlCharacters } from 'node:util';

/** East Asian wide and fullwidth ranges, plus emoji, which terminals draw two cells wide. */
const wideRanges: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
];

const isWide = (code: number) => wideRanges.some(([start, end]) => code >= start && code <= end);

/** How many terminal cells `text` takes, ignoring color codes. */
export function displayWidth(text: string) {
  let width = 0;
  for (const char of stripVTControlCharacters(text)) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x300 && code <= 0x36f) || code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) {
      continue;
    }
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

export function padEnd(text: string, width: number) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** Lay out rows in columns two spaces apart. The last column is not padded. */
export function columns(rows: readonly (readonly string[])[]) {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, displayWidth(cell));
    });
  }
  return rows.map((row) =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : padEnd(cell, widths[index] ?? 0)))
      .join('  ')
      .trimEnd(),
  );
}

/** Quote a word for a POSIX shell, so equivalent commands can be pasted as they are. */
export function shellQuote(word: string) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) return word;
  return `'${word.replaceAll("'", `'\\''`)}'`;
}

/** `a`, `a and b`, `a, b and c`. */
export function listing(items: readonly string[]) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
