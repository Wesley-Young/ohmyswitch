import { isScalar, type YAMLMap } from 'yaml';

/**
 * Put the entries of `map` named in `keys` into that order, within the positions they already occupy; other entries
 * stay where they are, and keys not in the map are skipped. Comments above an entry move with it; blank lines
 * separate positions, so they stay. Returns whether anything moved.
 */
export function reorderYamlMap(map: YAMLMap, keys: readonly string[]) {
  const { items } = map;
  const keyOf = (index: number) => {
    const key = items[index]?.key;
    return isScalar(key) ? String(key.value) : undefined;
  };
  const wanted = new Set(keys);
  const slots = items.flatMap((_, index) => (wanted.has(keyOf(index) ?? '') ? [index] : []));
  const pairs = new Map(slots.map((index) => [keyOf(index), items[index]]));
  const order = keys.filter((key) => pairs.has(key));
  if (slots.every((index, position) => keyOf(index) === order[position])) return false;
  // A comment above the map's first entry belongs to that entry, but the parser attaches it to the map.
  const first = items[0]?.key;
  if (slots[0] === 0 && map.commentBefore && isScalar(first)) {
    first.commentBefore = [map.commentBefore, first.commentBefore].filter(Boolean).join('\n');
    map.commentBefore = null;
  }
  const spacing = slots.map((index) => (isScalar(items[index].key) ? items[index].key.spaceBefore : undefined));
  slots.forEach((index, position) => {
    const pair = pairs.get(order[position]) as (typeof items)[number];
    if (isScalar(pair.key)) pair.key.spaceBefore = spacing[position];
    items[index] = pair;
  });
  return true;
}
