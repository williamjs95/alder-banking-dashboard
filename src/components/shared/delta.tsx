import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPercent, percentChange } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Change against a previous period. Whether a rise is good news depends on the
 * metric (revenue up is good, spend up is not), so the caller says which.
 */
export function Delta({
  current,
  previous,
  goodWhen,
  label,
  className,
}: {
  current: number;
  previous: number;
  goodWhen: "up" | "down";
  /** The comparison period, e.g. "vs previous 30 days". */
  label: string;
  className?: string;
}) {
  const change = percentChange(current, previous);

  if (change === null || Math.abs(change) < 0.05) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          className,
        )}
      >
        <Minus className="size-3.5" aria-hidden="true" />
        {change === null ? "No earlier data" : `No change ${label}`}
      </span>
    );
  }

  const up = change > 0;
  const good = up === (goodWhen === "up");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium",
          good ? "text-positive" : "text-destructive",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{up ? "Up" : "Down"}</span>
        {formatPercent(change)}
      </span>
      {label}
    </span>
  );
}
