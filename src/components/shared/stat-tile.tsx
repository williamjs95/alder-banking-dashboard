import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One headline number with its label and an optional line of context. */
export function StatTile({
  label,
  value,
  footer,
}: {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="gap-1.5 px-5 py-4 shadow-none">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-[1.625rem] leading-tight font-medium">
        {value}
      </p>
      {footer && <div className="mt-0.5">{footer}</div>}
    </Card>
  );
}

/**
 * Sets stat tiles side by side as columns of one sheet, separated by rules,
 * the way figures sit across a ledger page. The grid columns come from
 * `className`; the gaps between tiles show through as the rules.
 */
export function StatStrip({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border bg-border [&>[data-slot=card]]:rounded-none [&>[data-slot=card]]:border-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
