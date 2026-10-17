import { applyEdits, type JSONPath, modify, type ParseError, parse } from 'jsonc-parser';

export type JsonObject = Record<string, unknown>;

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse JSON with comments and trailing commas. Returns undefined when the text is not valid. */
export function parseJsonc(text: string): unknown {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  return errors.length ? undefined : value;
}

/** Indentation and line endings of the existing text, so edits blend in. */
function formatting(text: string) {
  const indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? '  ';
  return {
    insertSpaces: !indent.startsWith('\t'),
    tabSize: indent.startsWith('\t') ? 1 : indent.length,
    eol: text.includes('\r\n') ? '\r\n' : '\n',
  };
}

/**
 * Set (or with `undefined`, remove) the value at `path`, rewriting only that subtree. Comments and formatting
 * elsewhere are kept; comments inside the replaced subtree are not.
 */
export function setJsoncValue(text: string, path: JSONPath, value: unknown) {
  return applyEdits(text, modify(text, path, value, { formattingOptions: formatting(text) }));
}

/** Compare JSON values regardless of object key order. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = Object.keys(a).filter((key) => a[key] !== undefined);
    const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined);
    return keys.length === otherKeys.length && keys.every((key) => jsonEqual(a[key], b[key]));
  }
  return a === b;
}
