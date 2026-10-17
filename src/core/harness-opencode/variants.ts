import type { ModelInfo, ReasoningOption } from '../provider.ts';

/**
 * OpenCode's reasoning variants for a model, ported from `Variant.resolve` in OpenCode v2.0.27
 * (`packages/core/src/variant.ts`) for the packages ohmyswitch writes. See `docs/harness/opencode.md`.
 */

export type OpenCodeProtocol = 'chat' | 'responses' | 'anthropic' | 'google';

type Overlay = Record<string, unknown>;
type Variant = { id: string } & Overlay;
type Protocol = (model: ModelInfo, option: ReasoningOption) => Variant[];

const ADAPTIVE_THINKING = { type: 'adaptive', display: 'summarized' };
const ANTHROPIC_OUTPUT_TOKEN_MAX = 32_000;
/** OpenCode's output limit for a configured model that does not set one. */
const DEFAULT_OUTPUT = 32_000;

const variant = (id: string, overlay: Overlay): Variant => ({ id, ...overlay });
const efforts = (values: readonly string[], spell: (effort: string) => Overlay) =>
  values.map((effort) => variant(effort, spell(effort)));
const toggle = (off: Overlay, on: Overlay) => [variant('none', off), variant('thinking', on)];
const output = (model: ModelInfo) => model.maxOutput ?? DEFAULT_OUTPUT;

function budgets(
  model: ModelInfo,
  option: Extract<ReasoningOption, { type: 'budget_tokens' }>,
  spell: (tokens: number) => Overlay,
  ceiling = output(model),
) {
  const maximum = Math.min(option.max ?? ceiling - 1, output(model) - 1, ceiling - 1);
  if (maximum <= 0) return [];
  const high = Math.min(Math.max(option.min ?? 0, Math.floor((maximum + 1) / 2)), maximum);
  return [variant('high', spell(high)), variant('max', spell(maximum))];
}

function claudeInfo(model: ModelInfo) {
  const familyFirst = /(?:claude-)?(opus|sonnet|haiku|fable|mythos)-(\d+)(?:[.-](\d+))?/i.exec(model.id);
  const versionFirst = /claude-(\d+)(?:[.-](\d+))?-(opus|sonnet|haiku|fable|mythos)/i.exec(model.id);
  const family = (familyFirst?.[1] ?? versionFirst?.[3])?.toLowerCase();
  const major = Number(familyFirst?.[2] ?? versionFirst?.[1]);
  const minor = Number(familyFirst?.[3] ?? versionFirst?.[2] ?? 0);
  return {
    family,
    major,
    minor,
    manual: (major === 3 && minor === 7) || (major === 4 && minor < 6),
    always: family === 'fable' || family === 'mythos' || model.id.toLowerCase().includes('mythos-preview'),
  };
}

function manualThinking(model: ModelInfo): Overlay | undefined {
  const tokens = Math.min(16_000, output(model) - 1);
  if (tokens < 1024) return undefined;
  return { settings: { thinking: { type: 'enabled', budgetTokens: tokens } } };
}

const chat: Protocol = (_, option) =>
  option.type === 'effort' ? efforts(option.values, (effort) => ({ settings: { reasoningEffort: effort } })) : [];

const responses: Protocol = (_, option) =>
  option.type === 'effort'
    ? efforts(option.values, (effort) => ({
        settings: { reasoningEffort: effort, reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] },
      }))
    : [];

const anthropic: Protocol = (model, option) => {
  const info = claudeInfo(model);
  const opus45 = info.family === 'opus' && info.major === 4 && info.minor === 5;
  switch (option.type) {
    case 'effort': {
      if (info.manual && !opus45) return anthropic(model, { type: 'budget_tokens', min: 1024 });
      const thinking = opus45 ? manualThinking(model) : { settings: { thinking: ADAPTIVE_THINKING } };
      if (!thinking) return [];
      const values = option.values.filter((effort) => !info.always || effort !== 'none');
      return efforts(values, (effort) =>
        effort === 'none'
          ? { settings: { thinking: { type: 'disabled' } } }
          : { settings: { ...(thinking.settings as Overlay), effort } },
      );
    }
    case 'toggle': {
      if (info.always) return [];
      const thinking = info.manual ? manualThinking(model) : { settings: { thinking: ADAPTIVE_THINKING } };
      if (!thinking) return [];
      return toggle({ settings: { thinking: { type: 'disabled' } } }, thinking);
    }
    case 'budget_tokens':
      return budgets(
        model,
        option,
        (tokens) => ({ settings: { thinking: { type: 'enabled', budgetTokens: tokens } } }),
        ANTHROPIC_OUTPUT_TOKEN_MAX,
      );
  }
};

const google: Protocol = (model, option) => {
  switch (option.type) {
    case 'effort':
      return efforts(option.values, (effort) => ({
        settings: { thinkingConfig: { includeThoughts: true, thinkingLevel: effort } },
      }));
    case 'toggle':
      return toggle(
        { settings: { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } } },
        { settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } } },
      );
    case 'budget_tokens':
      return budgets(model, option, (tokens) => ({
        settings: { thinkingConfig: { includeThoughts: true, thinkingBudget: tokens } },
      }));
  }
};

const protocols: Record<OpenCodeProtocol, Protocol> = { chat, responses, anthropic, google };

/**
 * The `variants` to write for a model, or undefined to leave them to OpenCode. A model known not to reason gets
 * an empty list, so OpenCode does not invent levels for it.
 */
export function openCodeVariants(model: ModelInfo, protocol: OpenCodeProtocol): Variant[] | undefined {
  if (model.reasoning === false) return [];
  const options = model.reasoningOptions;
  if (!model.reasoning || !options) return undefined;
  const resolve = protocols[protocol];
  const switchable = options.some((option) => option.type === 'toggle') ? resolve(model, { type: 'toggle' }) : [];
  const effort = options.find((option) => option.type === 'effort');
  const budget = options.find((option) => option.type === 'budget_tokens');
  const main = effort ? resolve(model, effort) : budget ? resolve(model, budget) : switchable;
  const variants = [...switchable.filter((item) => item.id === 'none'), ...main];
  return variants.filter((item, index) => variants.findIndex((other) => other.id === item.id) === index);
}
