import Link from "next/link";
import { cn } from "@/lib/utils";

export type RankedBar = {
  key: string;
  label: string;
  value: number;
  /** The value as it should be read, e.g. "$12,400". */
  display: string;
  /** Secondary text under the label. */
  detail?: string;
  href?: string;
};

/**
 * Horizontal bars on one baseline, largest first, in a single hue. Every bar
 * carries its value as text, so nothing here depends on hover or on color.
 */
export function RankedBars({ items }: { items: readonly RankedBar[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {item.label}
                {item.detail && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                )}
              </span>
              <span className="tabular font-medium">{item.display}</span>
            </span>
            <span className="mt-1.5 block h-1.5 w-full rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-chart-1"
                style={{ width: `${Math.max(1, (item.value / max) * 100)}%` }}
              />
            </span>
          </>
        );
        const className = "-mx-2 block rounded-md px-2 py-1.5";
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  className,
                  "outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
                )}
              >
                {content}
              </Link>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
