import type { ReactNode } from "react";

export type TooltipRow = { name: string; value: string; color?: string };

/**
 * Shared tooltip body. The value is the strong element and the series name is
 * secondary: at this point the reader knows the series and wants the number.
 * Series are keyed by a short stroke of their color, never by colored text.
 */
export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: readonly TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="mb-1.5 text-xs text-muted-foreground">{title}</p>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                aria-hidden="true"
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-muted-foreground">{row.name}</span>
            <span className="tabular ml-auto pl-3 font-semibold">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t pt-1.5 text-xs">{footer}</div>}
    </div>
  );
}

/** Legend for multi-series charts: a swatch shaped like the mark, plus the name. */
export function ChartLegend({
  items,
}: {
  items: readonly { name: string; color: string }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li
          key={item.name}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** Axis text style shared by every chart. */
export const AXIS_TICK = { fill: "var(--subtle-foreground)", fontSize: 12 };
