import type { ModelInfo } from '#core/provider.ts';

const byId = (a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id);

/**
 * The provider's models after choosing which of its listed models to keep. Saved models the provider does not list
 * are left as they are. For a kept model, values already saved (possibly edited by hand) win; the listed metadata
 * only fills the gaps.
 */
export function pickedModels(
  saved: readonly ModelInfo[],
  listed: readonly ModelInfo[],
  selected: readonly string[],
): ModelInfo[] {
  const listedIds = new Set(listed.map((model) => model.id));
  const chosen = new Set(selected);
  const existing = new Map(saved.map((model) => [model.id, model]));
  return [
    ...saved.filter((model) => !listedIds.has(model.id)),
    ...listed.filter((model) => chosen.has(model.id)).map((model) => ({ ...model, ...existing.get(model.id) })),
  ].sort(byId);
}

/**
 * How the provider's model list changed since it was last reviewed: models listed since then that are not saved,
 * and saved models that were listed then but no longer are. Nothing until the list has been recorded once.
 */
export function changesSince(
  saved: readonly ModelInfo[],
  reviewed: readonly string[] | undefined,
  listed: readonly ModelInfo[],
) {
  if (!reviewed) return { added: [], removed: [] };
  const reviewedIds = new Set(reviewed);
  const savedIds = new Set(saved.map((model) => model.id));
  const listedIds = new Set(listed.map((model) => model.id));
  return {
    added: listed.filter((model) => !reviewedIds.has(model.id) && !savedIds.has(model.id)),
    removed: saved.filter((model) => reviewedIds.has(model.id) && !listedIds.has(model.id)),
  };
}
