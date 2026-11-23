import { command, flag, text } from '#cli/framework/command.ts';
import { CliError, ParamError } from '#cli/framework/errors.ts';
import { plural } from '#cli/framework/text.ts';
import { parseWith } from '#cli/framework/validate.ts';
import { usageDays } from '#core/harnesses/schemas.ts';
import { emptyTokens } from '#core/harnesses/usage/report.ts';

function positiveInteger(value: string) {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1)
    throw new ParamError('must be a positive integer');
  return number;
}

const number = new Intl.NumberFormat('en-US').format;
const percent = (part: number, total: number) => (total ? `${((100 * part) / total).toFixed(1)}%` : '—');

export const usage = command({
  name: 'usage',
  summary: 'Show local model usage',
  params: {
    days: text({
      summary: 'Include this many calendar days (default: 30)',
      optional: true,
      ask: false,
      parse: (raw) => parseWith(usageDays, positiveInteger(raw)),
    }),
    all: flag({ summary: 'Include all recorded history' }),
    model: text({ summary: 'Show usage by harness for this exact model ID', optional: true, ask: false }),
    limit: text({ summary: 'Show the first N models', optional: true, ask: false, parse: positiveInteger }),
  },
  async run({ days, all, model, limit }, scope) {
    if (all && days !== undefined) throw new CliError('usage', 'Choose either --all or --days.');
    if (model !== undefined && limit !== undefined) throw new CliError('usage', 'Use --limit with the model ranking.');
    const { harnesses } = await scope.services();
    const report = await harnesses.usage(all ? null : (days ?? 30));
    const models =
      model === undefined ? report.models.slice(0, limit) : report.models.filter((row) => row.id === model);
    if (model !== undefined && !models.length && !report.incompleteSources.length)
      throw new CliError('not_found', `No recorded usage for model "${model}" in this period.`);
    if (model !== undefined)
      return { ...report, models, totals: models[0]?.totals ?? emptyTokens(), modelCount: models.length };
    return { ...report, models };
  },
  failed: (result) => result.incompleteSources.length > 0,
  render(report, out, { model }) {
    for (const name of report.incompleteSources) out.warn(`Some ${name} usage data could not be read.`);
    const row = report.models[0];
    const totals = report.totals;
    out.print(`Model usage    ${report.from ?? 'All history'} to ${report.to}`);
    if (!totals.total) {
      out.print('No recorded usage.');
      return;
    }
    const scope = model === undefined ? plural(report.modelCount, 'model') : model;
    out.print(`${number(totals.total)} tokens    ${scope}    ${percent(totals.cacheRead, totals.total)} cache read`);
    out.print();
    if (model !== undefined && row) {
      out.table(
        ['HARNESS', 'TOTAL TOKENS', 'INPUT', 'CACHE READ', 'CACHE WRITE', 'OUTPUT'],
        row.harnesses.map(({ name, totals: t }) => [
          name,
          number(t.total),
          number(t.input),
          number(t.cacheRead),
          number(t.cacheWrite),
          number(t.output),
        ]),
        [1, 2, 3, 4, 5],
      );
    } else {
      out.table(
        ['MODEL ID', 'TOTAL TOKENS', 'SHARE', 'CACHE READ'],
        report.models.map(({ id, totals: t }) => [
          id ?? '(unattributed)',
          number(t.total),
          percent(t.total, report.totals.total),
          number(t.cacheRead),
        ]),
        [1, 2, 3],
      );
    }
  },
});
