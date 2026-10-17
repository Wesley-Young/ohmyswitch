import type { RouterOutputs } from './trpc';

export type Model = RouterOutputs['providers']['get']['models'][number];

/** Compact token count: 128000 → 128K, 131072 → 128K, 1048576 → 1M. */
export function formatTokens(tokens: number) {
  const unit = tokens % 1024 === 0 ? 1024 : 1000;
  if (tokens >= unit * unit) return `${trim(tokens / unit / unit)}M`;
  if (tokens >= unit) return `${trim(tokens / unit)}K`;
  return String(tokens);
}

const trim = (value: number) => String(Math.round(value * 10) / 10);
