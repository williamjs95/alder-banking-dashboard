"use client";

import { Download, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/components/shared/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toQueryString } from "@/lib/api-client";
import type { AccountDto } from "@/lib/contracts";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  TRANSACTION_STATUSES,
} from "@/lib/domain";
import {
  clearedFilters,
  hasActiveFilters,
  splitList,
  type RawFilters,
} from "@/lib/transaction-filters";
import { AmountFilter } from "./amount-filter";
import { DateRangeFilter } from "./date-range-filter";
import { FacetFilter } from "./facet-filter";
import type { UrlPatch } from "./use-transaction-filters";

const ALL = "all";
const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));
const STATUS_OPTIONS = TRANSACTION_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

const toCents = (value: string | undefined) =>
  value === undefined ? undefined : Number(value);

/** Where the CSV of the current view comes from: same filters, no paging. */
export function exportHref(filters: RawFilters): string {
  const rest = { ...filters };
  delete rest.page;
  delete rest.pageSize;
  return `/api/transactions/export${toQueryString(rest)}`;
}

/**
 * One row of filters above the table they scope. Every control writes to the
 * URL through `onChange`; none of them keep the applied value in local state.
 */
export function FiltersBar({
  filters,
  accounts,
  onChange,
  onReplace,
}: {
  filters: RawFilters;
  accounts: readonly AccountDto[];
  onChange: (patch: UrlPatch) => void;
  onReplace: (filters: RawFilters) => void;
}) {
  // Typing is local and immediate; the URL (and the query) follow after a pause.
  const [search, setSearch] = useState(filters.q ?? "");
  const debounced = useDebouncedValue(search.trim(), 300);
  const applied = filters.q ?? "";
  useEffect(() => {
    if (debounced !== applied) onChange({ q: debounced });
    // Only a settled search term should write to the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const clearAll = () => {
    setSearch("");
    onReplace(clearedFilters(filters));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search transactions"
          placeholder="Search name, reference, amount…"
          className="h-8 bg-card pl-8 shadow-none"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <DateRangeFilter
        value={{ from: filters.from, to: filters.to }}
        onChange={(range) => onChange({ from: range.from, to: range.to })}
      />

      <Select
        value={filters.accountId ?? ALL}
        onValueChange={(value) =>
          onChange({ accountId: value === ALL ? undefined : value })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Account"
          className="bg-card shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All accounts</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.direction ?? ALL}
        onValueChange={(value) =>
          onChange({ direction: value === ALL ? undefined : value })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Direction"
          className="bg-card shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>In and out</SelectItem>
          <SelectItem value="in">Money in</SelectItem>
          <SelectItem value="out">Money out</SelectItem>
        </SelectContent>
      </Select>

      <FacetFilter
        label="Category"
        options={CATEGORY_OPTIONS}
        selected={splitList(filters.category)}
        onChange={(selected) => onChange({ category: selected.join(",") })}
      />
      <FacetFilter
        label="Status"
        options={STATUS_OPTIONS}
        selected={splitList(filters.status)}
        onChange={(selected) => onChange({ status: selected.join(",") })}
      />
      <AmountFilter
        value={{
          minCents: toCents(filters.minCents),
          maxCents: toCents(filters.maxCents),
        }}
        onChange={(range) =>
          onChange({
            minCents: range.minCents?.toString(),
            maxCents: range.maxCents?.toString(),
          })
        }
      />

      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X aria-hidden="true" />
          Clear filters
        </Button>
      )}

      <Button
        asChild
        variant="outline"
        size="sm"
        className="ml-auto bg-card shadow-none"
      >
        <a href={exportHref(filters)} download>
          <Download aria-hidden="true" />
          Export CSV
        </a>
      </Button>
    </div>
  );
}
