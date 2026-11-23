/** Counts are normalized at the reader. Output includes reasoning, input excludes cache traffic. */
export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });

export interface UsageRecord {
  time: number;
  model: string | null;
  tokens: Tokens;
  /** Stable across copies of an entry within this harness. */
  identity?: string;
}

interface Source {
  name: string;
  records: UsageRecord[];
  incomplete: boolean;
}

function add(target: Tokens, counts: Tokens) {
  target.input += counts.input;
  target.output += counts.output;
  target.cacheRead += counts.cacheRead;
  target.cacheWrite += counts.cacheWrite;
  target.total += counts.total;
}

function localDate(time: number) {
  const date = new Date(time);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function usageReport(sources: Source[], days: number | null, until: Date) {
  const start = new Date(until);
  start.setHours(0, 0, 0, 0);
  if (days !== null) start.setDate(start.getDate() - days + 1);
  const lowerBound = days === null ? -Infinity : start.getTime();
  let earliest = Infinity;
  const totals = emptyTokens();
  const models = new Map<string | null, { totals: Tokens; harnesses: Map<string, Tokens> }>();
  for (const source of sources) {
    const seen = new Set<string>();
    for (const { time, model, tokens, identity } of source.records) {
      if (!Number.isFinite(time) || time < lowerBound || time > until.getTime() || !tokens.total) continue;
      if (identity && seen.has(identity)) continue;
      if (identity) seen.add(identity);
      earliest = Math.min(earliest, time);
      const row = models.get(model) ?? { totals: emptyTokens(), harnesses: new Map<string, Tokens>() };
      models.set(model, row);
      const counts = row.harnesses.get(source.name) ?? emptyTokens();
      row.harnesses.set(source.name, counts);
      add(counts, tokens);
      add(row.totals, tokens);
      add(totals, tokens);
    }
  }
  return {
    from: days === null ? (Number.isFinite(earliest) ? localDate(earliest) : null) : localDate(lowerBound),
    to: localDate(until.getTime()),
    totals,
    modelCount: models.size - Number(models.has(null)),
    models: Array.from(models, ([id, row]) => ({
      id,
      totals: row.totals,
      harnesses: Array.from(row.harnesses, ([name, totals]) => ({ name, totals })).sort(
        (a, b) => b.totals.total - a.totals.total,
      ),
    })).sort((a, b) => b.totals.total - a.totals.total || (a.id ?? '').localeCompare(b.id ?? '')),
    incompleteSources: sources.filter((source) => source.incomplete).map((source) => source.name),
  };
}
