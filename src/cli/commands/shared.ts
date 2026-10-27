import { type Choice, type Scope, select } from '#cli/framework/command.ts';
import type { Output } from '#cli/framework/output.ts';
import type { Stage } from '#cli/framework/progress.ts';
import { listing } from '#cli/framework/text.ts';
import type { Endpoint } from '#core/endpoints.ts';
import { endpoints } from '#core/endpoints.ts';
import type { ApplicationState } from '#core/harnesses/applications.ts';
import type { HarnessFailure, HarnessService } from '#core/harnesses/service.ts';
import type { ModelInfo } from '#core/provider.ts';
import type { ModelStage, ProviderService } from '#core/providers/service.ts';
import { type Vendor, vendors } from '#core/vendors.ts';

export type ProviderSummary = ReturnType<ProviderService['list']>[number];
export type HarnessInfo = Awaited<ReturnType<HarnessService['list']>>[number];

/** A harness in results: its id for scripts and its name for people. */
export interface HarnessRef {
  id: string;
  name: string;
}

/** A harness that could not be written, as results report it. */
export interface HarnessProblem extends HarnessRef {
  message: string;
}

/** Protocol names of the endpoints, as the GUI shows them. */
export const endpointLabels = {
  '/v1/chat/completions': 'OpenAI Chat Completions',
  '/v1/responses': 'OpenAI Responses',
  '/v1/messages': 'Anthropic Messages',
  '/v1beta/generateContent': 'Google Generative AI',
} satisfies Record<Endpoint, string>;

/** Vendor names, as the GUI shows them. */
export const vendorLabels = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot',
  zhipu: 'Zhipu',
  xai: 'xAI',
  mistral: 'Mistral',
  meta: 'Meta',
  groq: 'Groq',
  minimax: 'MiniMax',
  doubao: 'Doubao',
  hunyuan: 'Hunyuan',
  baidu: 'Baidu',
  openrouter: 'OpenRouter',
  siliconcloud: 'SiliconCloud',
  stepfun: 'StepFun',
  cohere: 'Cohere',
  yi: 'Yi',
  baichuan: 'Baichuan',
} satisfies Record<Vendor, string>;

/** What --vendor accepts to leave the vendor unset, so the badge follows the endpoint. */
export const followEndpoint = 'follow';

export const vendorChoices = (): Choice<Vendor | typeof followEndpoint>[] => [
  {
    value: followEndpoint,
    keys: [followEndpoint, 'auto'],
    label: 'Follow the endpoint',
    hint: "The badge of the endpoint's vendor",
  },
  ...vendors.map((vendor) => ({
    value: vendor,
    keys: [vendor],
    label: vendorLabels[vendor],
    hint: vendor === vendorLabels[vendor] ? undefined : vendor,
  })),
];

export const vendorDetails = `One of ${listing(vendors)}, or ${followEndpoint} to show the endpoint's vendor`;

/** How an application's entry looks now. */
export const applicationStateLabels = {
  applied: 'applied',
  modified: 'changed outside ohmyswitch',
  missing: 'removed outside ohmyswitch',
  unreadable: 'config cannot be read',
} satisfies Record<ApplicationState, string>;

/** Short names accepted on the command line besides the endpoint path. */
const endpointAliases = {
  '/v1/chat/completions': 'chat',
  '/v1/responses': 'responses',
  '/v1/messages': 'messages',
  '/v1beta/generateContent': 'gemini',
} satisfies Record<Endpoint, string>;

export const endpointChoices = (): Choice<Endpoint>[] =>
  endpoints.map((endpoint) => ({
    value: endpoint,
    keys: [endpointAliases[endpoint], endpoint],
    label: endpointLabels[endpoint],
    hint: endpoint,
  }));

export const endpointDetails = `One of ${listing(endpoints.map((endpoint) => endpointAliases[endpoint]))}, or the endpoint path`;

/** Providers in list order. `disabled` gives a reason a provider cannot be chosen for this command. */
export async function providerChoices(
  scope: Scope,
  disabled?: (provider: ProviderSummary) => string | undefined,
): Promise<Choice<ProviderSummary>[]> {
  const ctx = await scope.services();
  return ctx.providers.list().map((provider) => ({
    value: provider,
    keys: [provider.name, provider.id],
    label: provider.name,
    hint: endpointLabels[provider.endpoint],
    disabled: disabled?.(provider),
  }));
}

export const noProviders = 'There are no providers yet. Add one with "oms provider add".';

/** The provider a command works on, by name or id. */
export function providerParam(disabled?: (provider: ProviderSummary) => string | undefined) {
  return select({
    summary: 'Provider',
    positional: true,
    placeholder: 'provider',
    details: 'Its name or id',
    empty: noProviders,
    choices: (scope: Scope) => providerChoices(scope, disabled),
  });
}

/** Registered harnesses by id. */
export async function harnessIndex(scope: Scope) {
  const ctx = await scope.services();
  return new Map((await ctx.harnesses.list()).map((harness) => [harness.id, harness]));
}

/** A harness by its id or name; a name with spaces also works with dashes: `opencode`, `deepseek-harness`. */
export const harnessKeys = (harness: HarnessRef) => [
  harness.id,
  harness.name,
  harness.name.toLowerCase().replaceAll(' ', '-'),
];

export function refOf(id: string, harnesses: ReadonlyMap<string, HarnessRef>): HarnessRef {
  return { id, name: harnesses.get(id)?.name ?? id };
}

export function problemsOf(
  failures: readonly HarnessFailure[],
  harnesses: ReadonlyMap<string, HarnessRef>,
): HarnessProblem[] {
  return failures.map((failure) => ({ ...refOf(failure.harnessId, harnesses), message: failure.message }));
}

/** Token counts the way the GUI writes them: 128K, 1M, 200K. */
export function formatTokens(tokens: number) {
  const unit = tokens % 1024 === 0 ? 1024 : 1000;
  const trim = (value: number) => String(Math.round(value * 10) / 10);
  if (tokens >= unit * unit) return `${trim(tokens / unit / unit)}M`;
  if (tokens >= unit) return `${trim(tokens / unit)}K`;
  return String(tokens);
}

const modelHint = (model: ModelInfo) =>
  [model.name, model.contextWindow && `${formatTokens(model.contextWindow)} context`].filter(Boolean).join(', ') ||
  undefined;

export const modelChoice = (model: ModelInfo): Choice<string> => ({
  value: model.id,
  keys: [model.id],
  label: model.id,
  hint: modelHint(model),
});

/** Spinner messages for the steps of getting a provider's models. */
export function modelStages(provider: { baseUrl: string }, stage: Stage) {
  return (step: ModelStage) =>
    stage(
      step === 'list'
        ? `Fetching models from ${new URL(provider.baseUrl).host}…`
        : 'Loading model details from models.dev…',
    );
}

/** One warning per harness that could not be written. */
export function warnProblems(out: Output, problems: readonly HarnessProblem[]) {
  for (const problem of problems) out.warn(`${problem.name}: ${problem.message}`);
}
