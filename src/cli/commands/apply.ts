import { type Choice, command, flag, type Scope, selectMany } from '#cli/framework/command.ts';
import { toCliError } from '#cli/framework/errors.ts';
import { listing } from '#cli/framework/text.ts';
import { AppError } from '#core/errors.ts';
import {
  applicationStateLabels,
  endpointLabels,
  type HarnessInfo,
  type HarnessProblem,
  type HarnessRef,
  harnessIndex,
  harnessKeys,
  type ProviderSummary,
  problemsOf,
  providerParam,
  refOf,
  warnProblems,
} from './shared.ts';

const chosen = (scope: Scope) => scope.values.provider as ProviderSummary;

/** Why a provider cannot be applied to a harness now, if it cannot. */
function blocker(harness: HarnessInfo, provider: ProviderSummary) {
  if (!harness.detected) return 'not found on this machine';
  if (harness.unsupportedEndpoints.includes(provider.endpoint)) {
    return `does not support ${endpointLabels[provider.endpoint]}`;
  }
  return undefined;
}

async function applyChoices(scope: Scope): Promise<Choice<HarnessInfo>[]> {
  const provider = chosen(scope);
  return [...(await harnessIndex(scope)).values()].map((harness) => ({
    value: harness,
    keys: harnessKeys(harness),
    label: harness.name,
    hint: provider.harnesses.includes(harness.id) ? 'applied; writes it again' : undefined,
    disabled: blocker(harness, provider),
  }));
}

const apply = command({
  name: 'apply',
  summary: 'Apply a provider to harnesses',
  params: {
    provider: providerParam(),
    all: flag({ summary: 'Apply to every harness found on this machine that does not have it yet' }),
    harnesses: selectMany({
      summary: 'Harnesses',
      positional: true,
      placeholder: 'harness',
      details: 'By id or name',
      optional: true,
      requiredWhen: (values) => !values.all,
      empty: 'No harness that can take this provider was found on this machine.',
      choices: applyChoices,
    }),
    replace: flag({ summary: 'Take over an existing entry with the same key' }),
  },
  async run({ provider, all, harnesses, replace }, scope) {
    const ctx = await scope.services();
    const index = await harnessIndex(scope);
    // Like 应用所有 in the GUI: every harness found here that can serve the endpoint and lacks the provider.
    const targets = all
      ? [...index.values()].filter((harness) => !provider.harnesses.includes(harness.id) && !blocker(harness, provider))
      : harnesses;
    const applied: (HarnessRef & { key: string })[] = [];
    const failures: HarnessProblem[] = [];
    for (const harness of targets) {
      const ref = refOf(harness.id, index);
      const attempt = (takeOver: boolean) => ctx.harnesses.apply(provider.id, harness.id, takeOver);
      try {
        applied.push({ ...ref, ...(await attempt(replace)) });
      } catch (error) {
        if (!(error instanceof AppError && error.kind === 'conflict')) {
          failures.push({ ...ref, message: toCliError(error).message });
          continue;
        }
        const question = `${harness.name} already has an entry with the key ohmyswitch would use. Replace it with "${provider.name}"?`;
        if (all || !(await scope.confirm(question, 'replace'))) {
          failures.push({
            ...ref,
            message: all
              ? 'it already has an entry with the same key; apply to it alone with --replace to take it over'
              : 'it already has an entry with the same key; pass --replace to take it over',
          });
          continue;
        }
        try {
          applied.push({ ...ref, ...(await attempt(true)) });
        } catch (retryError) {
          failures.push({ ...ref, message: toCliError(retryError).message });
        }
      }
    }
    return { provider: { id: provider.id, name: provider.name }, applied, failures };
  },
  render(result, out) {
    if (result.applied.length) {
      out.success(`Applied "${result.provider.name}" to ${listing(result.applied.map((harness) => harness.name))}.`);
    } else if (!result.failures.length) {
      out.hint(`Nothing to do: every harness found here that can take "${result.provider.name}" already has it.`);
    }
    warnProblems(out, result.failures);
  },
  failed: (result) => result.failures.length > 0,
});

async function appliedChoices(scope: Scope): Promise<Choice<HarnessInfo>[]> {
  const provider = chosen(scope);
  return [...(await harnessIndex(scope)).values()].map((harness) => ({
    value: harness,
    keys: harnessKeys(harness),
    label: harness.name,
    disabled: provider.harnesses.includes(harness.id) ? undefined : 'not applied',
  }));
}

const unapply = command({
  name: 'unapply',
  summary: 'Remove a provider from harnesses',
  params: {
    provider: providerParam((provider) => (provider.harnesses.length ? undefined : 'not applied to any harness')),
    all: flag({ summary: 'Remove it from every harness it is applied to' }),
    harnesses: selectMany({
      summary: 'Harnesses',
      positional: true,
      placeholder: 'harness',
      details: 'By id or name',
      optional: true,
      requiredWhen: (values) => !values.all,
      choices: appliedChoices,
    }),
  },
  async run({ provider, all, harnesses }, scope) {
    const ctx = await scope.services();
    const index = await harnessIndex(scope);
    const ids = all ? provider.harnesses : harnesses.map((harness) => harness.id);
    const { failures } = await ctx.harnesses.unapplyMany(provider.id, ids);
    const problems = problemsOf(failures, index);
    const removed = ids.filter((id) => !problems.some((problem) => problem.id === id)).map((id) => refOf(id, index));
    return { provider: { id: provider.id, name: provider.name }, removed, failures: problems };
  },
  render(result, out) {
    if (result.removed.length) {
      out.success(`Removed "${result.provider.name}" from ${listing(result.removed.map((harness) => harness.name))}.`);
    }
    warnProblems(out, result.failures);
  },
  failed: (result) => result.failures.length > 0,
});

const status = command({
  name: 'status',
  summary: 'Show which harnesses each provider is applied to',
  params: {},
  async run(_values, scope) {
    const ctx = await scope.services();
    const index = await harnessIndex(scope);
    const applications = await ctx.harnesses.applications();
    return ctx.providers.list().flatMap((provider) =>
      (applications[provider.id] ?? []).map(({ harnessId, key, state }) => ({
        provider: { id: provider.id, name: provider.name },
        harness: refOf(harnessId, index),
        key,
        state,
      })),
    );
  },
  render(rows, out) {
    if (!rows.length) {
      out.hint('No provider is applied to a harness yet. Apply one with "oms apply".');
      return;
    }
    out.table(
      ['PROVIDER', 'HARNESS', 'KEY', 'STATE'],
      rows.map((row) => [row.provider.name, row.harness.name, row.key, applicationStateLabels[row.state]]),
    );
    if (rows.some((row) => row.state === 'modified' || row.state === 'missing')) {
      out.hint('Run "oms apply <provider> <harness>" to write an entry again.');
    }
  },
});

export const applicationCommands = [apply, unapply, status];
