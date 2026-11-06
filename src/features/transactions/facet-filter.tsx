"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** A multi-select filter: a button showing how many are chosen, and a checklist. */
export function FacetFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}) {
  const id = useId();
  const toggle = (value: string, checked: boolean) =>
    onChange(
      checked
        ? [...selected, value]
        : selected.filter((candidate) => candidate !== value),
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="bg-card shadow-none">
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-brand-soft px-1.5 text-xs font-semibold text-brand-ink">
              {selected.length}
              <span className="sr-only"> selected</span>
            </span>
          )}
          <ChevronDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
          {options.map((option) => {
            const optionId = `${id}-${option.value}`;
            return (
              <li key={option.value}>
                <label
                  htmlFor={optionId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    id={optionId}
                    checked={selected.includes(option.value)}
                    onCheckedChange={(checked) =>
                      toggle(option.value, checked === true)
                    }
                  />
                  {option.label}
                </label>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
