import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";

/** The closing state of a money-movement flow. */
export function SuccessPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center py-4 text-center" role="status">
      <CircleCheck className="mb-3 size-10 text-positive" aria-hidden="true" />
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

/** A label/value line in a review summary. */
export function SummaryRow({
  label,
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold" : "text-right"}>{children}</dd>
    </div>
  );
}
