import { Skeleton } from "@/components/ui/skeleton";

/** Generic loading placeholder for a page body: a toolbar and a tall panel. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label={label}>
      <Skeleton className="h-8 w-full max-w-xl rounded-md" />
      <Skeleton className="h-[480px] rounded-xl" />
    </div>
  );
}
