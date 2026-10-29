import type { RouterOutputs } from './trpc';

export type Model = RouterOutputs['providers']['get']['models'][number];
export type ProviderModelOverride = RouterOutputs['providers']['get']['modelOverrides'][string];
export const modelFieldLabels = {
  name: '名称',
  contextWindow: '上下文',
  maxOutput: '最大输出',
  reasoning: '推理',
  reasoningOptions: '推理选项',
  interleaved: '推理回传',
  input: '输入类型',
  toolCall: '工具调用',
} satisfies Record<Exclude<keyof Model, 'id'>, string>;
export type ModelInput = NonNullable<Model['input']>[number];

export const inputLabels = {
  text: '文本',
  image: '图片',
  pdf: 'PDF',
} satisfies Record<ModelInput, string>;

/** Inputs the user can toggle; text is always accepted. */
export const optionalInputs = (Object.keys(inputLabels) as ModelInput[]).filter((input) => input !== 'text');

/** Compact token count: 128000 → 128K, 131072 → 128K, 1048576 → 1M. */
export function formatTokens(tokens: number) {
  const unit = tokens % 1024 === 0 ? 1024 : 1000;
  if (tokens >= unit * unit) return `${trim(tokens / unit / unit)}M`;
  if (tokens >= unit) return `${trim(tokens / unit)}K`;
  return String(tokens);
}

/** Blank inputs inherit; NaN distinguishes invalid input from an absent override. */
export function parseOverrideTokens(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const digits = value.replace(/[\s,_]/g, '');
  if (!/^\d+$/.test(digits)) return NaN;
  const tokens = Number(digits);
  return Number.isSafeInteger(tokens) && tokens > 0 ? tokens : NaN;
}

const trim = (value: number) => String(Math.round(value * 10) / 10);
