import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder for a provider form while its values load. */
export function FormSkeleton() {
  return (
    <div className="grid max-w-md gap-6">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}
