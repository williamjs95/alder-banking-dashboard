import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the overview's layout so content lands without a jump. */
export function OverviewSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[390px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[390px] rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[350px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[350px] rounded-xl" />
      </div>
    </div>
  );
}
