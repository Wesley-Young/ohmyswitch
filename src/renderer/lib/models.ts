import type { RouterOutputs } from './trpc';

export type Model = RouterOutputs['providers']['get']['models'][number];
export type ModelInput = NonNullable<Model['input']>[number];
export type ReasoningOption = NonNullable<Model['reasoningOptions']>[number];

/**
 * How the provider's model list changed since it was last reviewed: models listed since then that are not saved,
 * and saved models that were listed then but no longer are. Nothing until the list has been recorded once.
 */
export function modelChanges(saved: readonly Model[], listed: readonly string[] | undefined, remote: readonly Model[]) {
  if (!listed) return { added: [], removed: [] };
  const listedIds = new Set(listed);
  const savedIds = new Set(saved.map((model) => model.id));
  const remoteIds = new Set(remote.map((model) => model.id));
  return {
    added: remote.filter((model) => !listedIds.has(model.id) && !savedIds.has(model.id)),
    removed: saved.filter((model) => listedIds.has(model.id) && !remoteIds.has(model.id)),
  };
}

export const effortValues = (options: readonly ReasoningOption[] | undefined) =>
  options?.find((option) => option.type === 'effort')?.values ?? [];

/** A short description of how reasoning is controlled, or undefined when the model does not reason. */
export function reasoningLabel(model: Model) {
  if (!model.reasoning) return undefined;
  const options = model.reasoningOptions;
  const efforts = effortValues(options);
  if (efforts.length) return `推理 (${efforts.length > 1 ? `${efforts[0]}–${efforts.at(-1)}` : efforts[0]})`;
  if (options?.some((option) => option.type === 'budget_tokens')) return '推理 (按预算)';
  if (options?.length === 0) return '推理 (不可调)';
  return '推理';
}

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

const trim = (value: number) => String(Math.round(value * 10) / 10);
