"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { parseMoneyInput, toMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Amount in cents, or null when the field is empty or not a valid amount. */
  value: number | null;
  onChange: (cents: number | null) => void;
};

/**
 * A dollar amount field that reports integer cents. People type freely
 * ("1250", "1,250.5"); the text is tidied to "1,250.50" when they leave the field.
 */
export function AmountInput({
  value,
  onChange,
  onBlur,
  className,
  ...props
}: Props) {
  const [text, setText] = useState(() =>
    value === null ? "" : toMoneyInput(value),
  );

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        $
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={text}
        className={cn("tabular pl-6", className)}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseMoneyInput(event.target.value));
        }}
        onBlur={(event) => {
          const cents = parseMoneyInput(text);
          if (cents !== null) setText(toMoneyInput(cents));
          onBlur?.(event);
        }}
      />
    </div>
  );
}
