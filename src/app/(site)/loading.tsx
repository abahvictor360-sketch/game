import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="mx-auto h-12 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
