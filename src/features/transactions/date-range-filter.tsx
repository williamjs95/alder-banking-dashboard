"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addDays, dayKey, formatDate, startOfUtcMonth } from "@/lib/dates";

export type DateRange = { from?: string; to?: string };

const PRESETS: readonly { label: string; range: (now: Date) => DateRange }[] = [
  {
    label: "Last 7 days",
    range: (now) => ({ from: dayKey(addDays(now, -6)) }),
  },
  {
    label: "Last 30 days",
    range: (now) => ({ from: dayKey(addDays(now, -29)) }),
  },
  {
    label: "Last 90 days",
    range: (now) => ({ from: dayKey(addDays(now, -89)) }),
  },
  {
    label: "This month",
    range: (now) => ({ from: dayKey(startOfUtcMonth(now)) }),
  },
  {
    label: "Last month",
    range: (now) => ({
      from: dayKey(startOfUtcMonth(now, -1)),
      to: dayKey(addDays(startOfUtcMonth(now), -1)),
    }),
  },
];

export function describeRange({ from, to }: DateRange): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `Since ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return "Any date";
}

/** Date filter: presets first, since nobody wants a calendar for "last 30 days". */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const id = useId();
  const active = Boolean(value.from || value.to);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card shadow-none">
          <CalendarDays className="text-muted-foreground" aria-hidden="true" />
          <span className={active ? undefined : "text-foreground"}>
            {describeRange(value)}
          </span>
          <ChevronDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <ul className="grid gap-0.5">
          {PRESETS.map((preset) => (
            <li key={preset.label}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => onChange(preset.range(new Date()))}
              >
                {preset.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-3">
          <div className="grid gap-1">
            <Label htmlFor={`${id}-from`} className="text-xs">
              From
            </Label>
            <Input
              id={`${id}-from`}
              type="date"
              className="h-8 px-2 text-xs"
              value={value.from ?? ""}
              max={value.to}
              onChange={(event) =>
                onChange({ ...value, from: event.target.value || undefined })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${id}-to`} className="text-xs">
              To
            </Label>
            <Input
              id={`${id}-to`}
              type="date"
              className="h-8 px-2 text-xs"
              value={value.to ?? ""}
              min={value.from}
              onChange={(event) =>
                onChange({ ...value, to: event.target.value || undefined })
              }
            />
          </div>
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => onChange({})}
          >
            Clear dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
