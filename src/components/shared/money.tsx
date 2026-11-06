import { formatMoney, type MoneyOptions } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * A money amount. With `tone`, money in turns green; money out stays in the
 * normal ink, so a column of outflows does not read as a column of errors.
 */
export function Money({
  cents,
  tone = false,
  className,
  ...options
}: MoneyOptions & { cents: number; tone?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone && cents > 0 && "text-positive",
        className,
      )}
    >
      {formatMoney(cents, options)}
    </span>
  );
}
