import { Snowflake } from "lucide-react";
import type { CardDto } from "@/lib/contracts";
import { cn } from "@/lib/utils";

/** A payment card face. Purely presentational: the controls sit beside it. */
export function CardVisual({ card }: { card: CardDto }) {
  const frozen = card.status === "frozen";
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-xl p-4 text-primary-foreground transition-opacity",
        "bg-primary",
        frozen && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{card.label}</span>
        <span className="rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          {card.type}
        </span>
      </div>
      <div>
        <p className="font-mono text-base tracking-widest">
          •••• •••• •••• {card.last4}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2 text-xs">
          <span className="truncate opacity-80">{card.holderName}</span>
          <span className="tabular opacity-80">
            {String(card.expMonth).padStart(2, "0")}/
            {String(card.expYear).slice(-2)}
          </span>
        </div>
      </div>
      {frozen && (
        <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1.5 text-sm font-semibold">
          <Snowflake className="size-4" aria-hidden="true" />
          Frozen
        </span>
      )}
    </div>
  );
}
