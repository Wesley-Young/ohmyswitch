import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState } from 'react';

import { PageContent, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Report = RouterOutputs['harnesses']['usage'];
type Model = Report['models'][number];
const format = new Intl.NumberFormat('zh-CN').format;
const percent = (n: number, total: number) => (total ? `${((100 * n) / total).toFixed(1)}%` : '—');
const buckets = {
  input: '未缓存输入',
  cacheRead: '缓存读取',
  cacheWrite: '缓存写入',
  output: '输出（含推理）',
} satisfies Record<Exclude<keyof Model['totals'], 'total'>, string>;

function Breakdown({ row }: { row: Model }) {
  return (
    <div className="grid grid-cols-2 gap-x-10 rounded-md bg-muted/40 px-4 py-3 text-sm">
      <div>
        <h3 className="mb-2 font-medium">按 Harness</h3>
        <dl className="space-y-1">
          {row.harnesses.map(({ name, totals }) => (
            <div className="flex justify-between gap-2" key={name}>
              <dt>{name}</dt>
              <dd>{format(totals.total)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3 className="mb-2 font-medium">token 构成</h3>
        <dl className="space-y-1">
          {(Object.keys(buckets) as (keyof typeof buckets)[]).map((key) => (
            <div key={key} className="flex justify-between gap-2">
              <dt>{buckets[key]}</dt>
              <dd>{format(row.totals[key])}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Ranking({ report }: { report: Report }) {
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="text-foreground">
          <strong className="text-3xl font-semibold tracking-tight">{format(report.totals.total)}</strong> token
        </span>
        <span>{report.modelCount} 个模型</span>
        <span title="缓存读取 token ÷ 总 token">缓存率 {percent(report.totals.cacheRead, report.totals.total)}</span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-fixed text-right text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="w-2/5 px-4 py-2 text-left font-medium">模型 ID</th>
              <th aria-sort="descending" className="px-3 py-2 font-medium">
                总 token ↓
              </th>
              <th className="w-[14%] px-3 py-2 font-medium">占比</th>
              <th className="px-4 py-2 font-medium">缓存读取</th>
            </tr>
          </thead>
          <tbody>
            {report.models.map((row) => {
              const open = expanded === row.id;
              const Icon = open ? ChevronDown : ChevronRight;
              return (
                <Fragment key={JSON.stringify(row.id)}>
                  <tr className="border-t">
                    <td className="px-2 py-1 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? undefined : row.id)}
                        className="w-full justify-start"
                      >
                        <Icon className="shrink-0" />
                        <span title={row.id ?? undefined} className="truncate font-mono">
                          {row.id ?? '未归属'}
                        </span>
                      </Button>
                    </td>
                    <td className="px-3">{format(row.totals.total)}</td>
                    <td className="px-3">{percent(row.totals.total, report.totals.total)}</td>
                    <td className="px-4">{format(row.totals.cacheRead)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={4} className="px-2 pb-2 text-left">
                        <Breakdown row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Usage() {
  const [days, setDays] = useState<number | null>(30);
  const usage = useQuery(trpc.harnesses.usage.queryOptions({ days }));
  const report = usage.data;
  const problem = usage.isError
    ? formError(usage.error)?.message
    : report?.incompleteSources.length
      ? `${report.incompleteSources.join('、')} 的部分用量无法读取`
      : undefined;
  return (
    <main className="min-w-0 flex-1 overflow-y-auto tabular-nums">
      <PageHeader
        title="模型用量"
        backTo="/providers"
        actions={
          <select
            aria-label="统计时段"
            className="rounded-md border bg-background px-2 py-1.5 text-sm dark:scheme-dark"
            value={days ?? 'all'}
            onChange={(event) => setDays(event.target.value === 'all' ? null : Number(event.target.value))}
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value="all">全部时间</option>
          </select>
        }
      >
        <p className="min-h-5 text-xs text-muted-foreground">{report?.from && `${report.from} 至 ${report.to}`}</p>
      </PageHeader>
      <PageContent>
        {problem && (
          <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border px-4 py-2 text-sm">
            <span>{problem}</span>
            <Button variant="outline" size="sm" disabled={usage.isFetching} onClick={() => void usage.refetch()}>
              重试
            </Button>
          </div>
        )}
        {usage.isPending ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : report?.models.length ? (
          <Ranking key={days ?? 'all'} report={report} />
        ) : (
          !problem && (
            <Empty className="rounded-lg border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BarChart3 />
                </EmptyMedia>
                <EmptyTitle>所选时段暂无模型用量</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )
        )}
      </PageContent>
    </main>
  );
}
