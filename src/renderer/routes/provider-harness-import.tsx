import { useMutation, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useHarnessFailures } from '@/components/harness-feedback';
import { HarnessGlyph } from '@/components/harness-icon';
import { PageContent, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Imports = RouterOutputs['providers']['harnessImports'];
type Candidate = Imports['candidates'][number];

/** Providers already configured in the harnesses, imported with their API keys and taken over by ohmyswitch. */
export default function ProviderHarnessImport() {
  // Harness configs change outside ohmyswitch, so they are always read fresh.
  const imports = useQuery(trpc.providers.harnessImports.queryOptions(undefined, { staleTime: 0 }));

  return (
    <>
      <PageHeader title="从 Harness 导入" backTo="/providers" />
      <PageContent>
        {imports.isPending ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : imports.isError ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
            <span className="text-destructive">{formError(imports.error)?.message}</span>
            <Button variant="outline" size="sm" onClick={() => imports.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <ImportForm imports={imports.data} onStale={() => imports.refetch()} />
        )}
      </PageContent>
    </>
  );
}

function ImportForm({ imports, onStale }: { imports: Imports; onStale: () => void }) {
  const navigate = useNavigate();
  const reportFailures = useHarnessFailures();
  const harnesses = useQuery(trpc.harnesses.list.queryOptions());
  const nameOf = (harnessId: string) => harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId;
  // Importable candidates first; the others only explain why they are left out.
  const candidates = [...imports.candidates].sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)));
  const importable = candidates.filter((candidate) => !candidate.reason);
  // Ids not unchecked yet, so a rescan keeps the choice and checks what is new.
  const [unchecked, setUnchecked] = useState(() => new Set<string>());
  const selected = importable.filter((candidate) => !unchecked.has(candidate.id));

  const importProviders = useMutation(
    trpc.providers.importFromHarnesses.mutationOptions({
      onSuccess: async ({ providers, harnessFailures }) => {
        await refreshProviders();
        toast.success(`已导入 ${providers.length} 个供应商`);
        reportFailures(harnessFailures);
        navigate(providers[0] ? `/providers/${providers[0].id}` : '/providers');
      },
      onError: (error) => {
        // A config changed since it was read: show what is there now.
        if (error instanceof TRPCClientError && error.data?.code === 'CONFLICT') onStale();
      },
    }),
  );

  if (!candidates.length && !imports.failures.length) {
    return (
      <Empty className="border py-16">
        <EmptyHeader>
          <EmptyTitle>没有可导入的供应商</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link to="/providers/new" />}>
            手动添加
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const toggle = (id: string, checked: boolean) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        importProviders.mutate({ candidates: selected.map((candidate) => ({ sources: candidate.sources })) });
      }}
    >
      {imports.failures.map((failure) => (
        <p key={failure.harnessId} role="alert" className="text-sm text-destructive">
          {nameOf(failure.harnessId)}：{failure.message}
        </p>
      ))}
      {candidates.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {candidates.map((candidate, index) => (
            <CandidateRow
              key={candidate.id}
              id={`harness-import-${index}`}
              candidate={candidate}
              checked={!candidate.reason && !unchecked.has(candidate.id)}
              onCheckedChange={(checked) => toggle(candidate.id, checked)}
              nameOf={nameOf}
            />
          ))}
        </ul>
      )}
      {importProviders.error && (
        <p role="alert" className="text-sm text-destructive">
          {formError(importProviders.error)?.message}
        </p>
      )}
      {importable.length > 0 && (
        // The consequence of taking over, so the user can decide.
        <p className="text-sm text-muted-foreground">
          导入后，这些条目由 ohmyswitch 管理，并按 ohmyswitch 的格式重新写入。
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!selected.length || importProviders.isPending}>
          {importProviders.isPending ? '正在导入…' : selected.length ? `导入 ${selected.length} 个` : '导入'}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to="/providers" />}>
          取消
        </Button>
      </div>
    </form>
  );
}

function CandidateRow({
  id,
  candidate,
  checked,
  onCheckedChange,
  nameOf,
}: {
  /** The checkbox id. */
  id: string;
  candidate: Candidate;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  nameOf: (harnessId: string) => string;
}) {
  const disabled = Boolean(candidate.reason);
  return (
    <li className="flex items-center gap-3 pl-4">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
      <label
        htmlFor={id}
        className={disabled ? 'min-w-0 flex-1 py-3 pr-4 opacity-60' : 'min-w-0 flex-1 cursor-pointer py-3 pr-4'}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{candidate.name}</span>
          {candidate.target && (
            <Badge variant="secondary" className="max-w-48 shrink-0" title={`并入「${candidate.target.name}」`}>
              <span className="truncate">并入「{candidate.target.name}」</span>
            </Badge>
          )}
        </div>
        {candidate.baseUrl && (
          <div
            className="truncate font-mono text-xs text-muted-foreground"
            title={`${candidate.baseUrl}${candidate.endpoint ?? ''}`}
          >
            {candidate.baseUrl}
            <span className="text-foreground">{candidate.endpoint}</span>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {candidate.sources.map((source) => (
            <Badge
              key={source.harnessId}
              variant="outline"
              className="max-w-60 font-normal text-muted-foreground"
              title={`${nameOf(source.harnessId)} 中的 ${source.key}`}
            >
              <HarnessGlyph id={source.harnessId} size={12} />
              <span className="sr-only">{nameOf(source.harnessId)}</span>
              <span className="truncate font-mono">{source.key}</span>
            </Badge>
          ))}
          {!disabled && candidate.modelCount > 0 && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {candidate.modelCount} 个模型
            </Badge>
          )}
        </div>
        {candidate.reason && <div className="mt-1 text-xs text-muted-foreground">{candidate.reason}</div>}
      </label>
    </li>
  );
}
