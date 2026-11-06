import { transactionFiltersSchema, type SortField } from "./contracts";

/**
 * Transaction filters live in the URL as plain strings, so a filtered view can
 * be bookmarked, shared and restored with the back button. This module is the
 * one place that reads them, used by both the server page and the client view
 * so the two always build the same query.
 */

export const FILTER_KEYS = [
  "q",
  "accountId",
  "cardId",
  "category",
  "status",
  "direction",
  "from",
  "to",
  "minCents",
  "maxCents",
  "sort",
  "order",
  "page",
  "pageSize",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type RawFilters = Partial<Record<FilterKey, string>>;

/** Keys that narrow the result set, as opposed to ordering or paging it. */
const NARROWING_KEYS: readonly FilterKey[] = [
  "q",
  "accountId",
  "cardId",
  "category",
  "status",
  "direction",
  "from",
  "to",
  "minCents",
  "maxCents",
];

/**
 * Reads filters from URL parameters. Values that fail validation are dropped
 * rather than rejected: a mistyped or stale link still shows transactions.
 */
export function readFilters(
  get: (key: FilterKey) => string | null | undefined,
): RawFilters {
  const raw: RawFilters = {};
  for (const key of FILTER_KEYS) {
    const value = get(key);
    if (value) raw[key] = value;
  }
  const result = transactionFiltersSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      delete raw[issue.path[0] as FilterKey];
    }
  }
  return raw;
}

export function hasActiveFilters(filters: RawFilters): boolean {
  return NARROWING_KEYS.some((key) => filters[key] !== undefined);
}

/** The filters with everything that narrows the results removed. */
export function clearedFilters(filters: RawFilters): RawFilters {
  const next = { ...filters };
  for (const key of NARROWING_KEYS) delete next[key];
  delete next.page;
  return next;
}

export const splitList = (value: string | undefined): string[] =>
  value ? value.split(",").filter(Boolean) : [];

const DEFAULT_ORDER: Record<SortField, "asc" | "desc"> = {
  date: "desc",
  amount: "desc",
  description: "asc",
};

export function currentSort(filters: RawFilters): {
  sort: SortField;
  order: "asc" | "desc";
} {
  const sort = (filters.sort as SortField | undefined) ?? "date";
  return {
    sort,
    order: (filters.order as "asc" | "desc" | undefined) ?? DEFAULT_ORDER.date,
  };
}

/** Clicking a column: sort by it, or flip the direction if it is already active. */
export function toggleSort(
  filters: RawFilters,
  field: SortField,
): Pick<RawFilters, "sort" | "order"> {
  const current = currentSort(filters);
  if (current.sort !== field) {
    return { sort: field, order: DEFAULT_ORDER[field] };
  }
  return { sort: field, order: current.order === "asc" ? "desc" : "asc" };
}
