import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  type JSONPath,
  modify,
  type Node,
  type ParseError,
  parse,
  parseTree,
} from 'jsonc-parser';

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

// jsonc-parser declares `SyntaxKind` as an ambient const enum, which cannot be referenced under
// `verbatimModuleSyntax`, so the values used here are repeated.
const commaToken = 5;
const lineCommentTrivia = 12;
const blockCommentTrivia = 13;
const lineBreakTrivia = 14;
const eof = 17;

/**
 * Where a property's own text starts: at the comments on the lines directly above it, so they move with it. A
 * comment on the same line as the preceding comma or brace belongs to what comes before and stays put.
 */
function propertyStart(text: string, gapStart: number, propertyOffset: number) {
  const scanner = createScanner(text.slice(gapStart, propertyOffset), false);
  // The opening brace counts as a separator; a comma resets the search.
  let lineBreakAfterSeparator = false;
  let start: number | undefined;
  for (let token = scanner.scan(); token !== eof; token = scanner.scan()) {
    if (token === commaToken) {
      lineBreakAfterSeparator = false;
      start = undefined;
    } else if (token === lineBreakTrivia) {
      lineBreakAfterSeparator = true;
    } else if ((token === lineCommentTrivia || token === blockCommentTrivia) && lineBreakAfterSeparator) {
      start ??= gapStart + scanner.getTokenOffset();
    }
  }
  return start ?? propertyOffset;
}

const propertyKey = (property: Node): unknown => property.children?.[0]?.value;

/**
 * Put the properties named in `keys` of the object at `path` into that order, within the positions they already
 * occupy. Other properties, and the commas and whitespace between properties, stay where they are. Keys that are
 * not in the object are skipped. Returns the text unchanged when the order is already right.
 */
export function reorderJsoncProperties(text: string, path: JSONPath, keys: readonly string[]) {
  const tree = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  const object = tree && findNodeAtLocation(tree, path);
  if (object?.type !== 'object' || !object.children) return text;
  const properties = object.children;
  const wanted = new Set(keys);
  const slots = properties.flatMap((property, index) => (wanted.has(propertyKey(property) as string) ? [index] : []));
  const present = new Set(slots.map((index) => propertyKey(properties[index])));
  const order = keys.filter((key) => present.has(key));
  if (slots.every((index, position) => propertyKey(properties[index]) === order[position])) return text;

  const ranges = properties.map((property, index) => {
    const previous = properties[index - 1];
    const gapStart = previous ? previous.offset + previous.length : object.offset + 1;
    return { start: propertyStart(text, gapStart, property.offset), end: property.offset + property.length };
  });
  const textOf = new Map(
    slots.map((index) => [propertyKey(properties[index]), text.slice(ranges[index].start, ranges[index].end)]),
  );
  let result = '';
  let cursor = 0;
  slots.forEach((index, position) => {
    result += text.slice(cursor, ranges[index].start) + textOf.get(order[position]);
    cursor = ranges[index].end;
  });
  return result + text.slice(cursor);
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

/**
 * A copy of `target` with each owned field set from `values`, or deleted when its value is undefined. Fields
 * not listed are kept, and existing keys keep their position.
 */
export function withOwnedFields(target: unknown, owned: readonly string[], values: JsonObject): JsonObject {
  const result: JsonObject = isJsonObject(target) ? { ...target } : {};
  for (const field of owned) {
    if (values[field] === undefined) delete result[field];
    else result[field] = values[field];
  }
  return result;
}
