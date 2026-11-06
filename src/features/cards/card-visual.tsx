import { Snowflake } from "lucide-react";
import type { CardDto } from "@/lib/contracts";
import { cn } from "@/lib/utils";

/** A payment card face. Purely presentational: the controls sit beside it. */
export function CardVisual({ card }: { card: CardDto }) {
  const frozen = card.status === "frozen";
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-xl border p-4 transition-colors",
        // A frozen card goes pale in solid colors. Fading it with opacity would
        // drop its text below a readable contrast.
        frozen
          ? "border-border bg-muted text-muted-foreground"
          : "border-transparent bg-primary text-primary-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{card.label}</span>
        <span className="rounded-full border border-current/25 px-2 py-0.5 text-[10px] font-medium capitalize">
          {card.type}
        </span>
      </div>
      <div>
        <p className="code text-base tracking-widest">
          •••• •••• •••• {card.last4}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2 text-xs">
          <span className="truncate">{card.holderName}</span>
          <span className="tabular">
            {String(card.expMonth).padStart(2, "0")}/
            {String(card.expYear).slice(-2)}
          </span>
        </div>
      </div>
      {frozen && (
        <span className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
          <Snowflake className="size-4" aria-hidden="true" />
          Frozen
        </span>
      )}
    </div>
  );
}
