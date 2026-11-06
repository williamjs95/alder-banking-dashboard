"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { AmountInput } from "@/components/shared/amount-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatMoney } from "@/lib/money";

export type AmountRange = { minCents?: number; maxCents?: number };

export function describeAmount({ minCents, maxCents }: AmountRange): string {
  const text = (cents: number) =>
    formatMoney(cents, { whole: cents % 100 === 0 });
  if (minCents !== undefined && maxCents !== undefined) {
    return `${text(minCents)} – ${text(maxCents)}`;
  }
  if (minCents !== undefined) return `At least ${text(minCents)}`;
  if (maxCents !== undefined) return `Up to ${text(maxCents)}`;
  return "Any amount";
}

function AmountForm({
  value,
  onApply,
}: {
  value: AmountRange;
  onApply: (range: AmountRange) => void;
}) {
  const id = useId();
  const [min, setMin] = useState<number | null>(value.minCents ?? null);
  const [max, setMax] = useState<number | null>(value.maxCents ?? null);
  const inverted = min !== null && max !== null && min > max;

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (inverted) return;
        onApply({ minCents: min ?? undefined, maxCents: max ?? undefined });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-min`} className="text-xs">
            Minimum
          </Label>
          <AmountInput id={`${id}-min`} value={min} onChange={setMin} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-max`} className="text-xs">
            Maximum
          </Label>
          <AmountInput
            id={`${id}-max`}
            value={max}
            onChange={setMax}
            aria-invalid={inverted || undefined}
          />
        </div>
      </div>
      {inverted && (
        <p role="alert" className="text-xs text-destructive">
          The maximum must be at least the minimum.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onApply({})}
        >
          Clear
        </Button>
        <Button type="submit" size="sm" disabled={inverted}>
          Apply
        </Button>
      </div>
    </form>
  );
}

/** Filters by absolute amount, so "$500 to $1,000" matches payments in either direction. */
export function AmountFilter({
  value,
  onChange,
}: {
  value: AmountRange;
  onChange: (range: AmountRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card shadow-none">
          {describeAmount(value)}
          <ChevronDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        {/* Mounted per opening, so the fields always start from the applied range. */}
        <AmountForm
          value={value}
          onApply={(range) => {
            onChange(range);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
