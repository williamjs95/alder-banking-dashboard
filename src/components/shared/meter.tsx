import { cn } from "@/lib/utils";

export type MeterLevel = "normal" | "warning" | "critical";

/** How close `value` is to `max`: warning from 80%, critical at or past 100%. */
export function meterLevel(value: number, max: number): MeterLevel {
  if (max <= 0 || value >= max) return "critical";
  return value / max >= 0.8 ? "warning" : "normal";
}

const FILL: Record<MeterLevel, string> = {
  normal: "bg-brand",
  warning: "bg-warning",
  critical: "bg-critical",
};

/** A single ratio against a limit. The label carries the meaning; color only reinforces it. */
export function Meter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** Accessible description, e.g. "$4,200 of $8,000 used". */
  label: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 1;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-chart-track",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", FILL[meterLevel(value, max)])}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
