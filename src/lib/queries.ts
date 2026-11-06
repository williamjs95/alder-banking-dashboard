import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, toQueryString } from "./api-client";
import type {
  AccountDetailDto,
  AccountDto,
  CardDto,
  InsightsDto,
  OverviewDto,
  RecipientDto,
  TransactionDto,
  TransactionListDto,
} from "./contracts";
import type { FilterKey } from "./transaction-filters";

/**
 * One definition per read: the cache key and the fetcher live together, so the
 * server (which seeds the cache during SSR) and the client can never disagree
 * about a query's identity.
 */

/** Transaction list parameters as they appear in the URL and on the wire. */
export type TransactionQuery = Partial<Record<FilterKey, string | number>>;

/**
 * The scheduled-payments list. Defined here, in a plain module, because both
 * the server page and the client view need the same value to build one key.
 */
export const SCHEDULED_PAYMENTS = {
  status: "scheduled",
  order: "asc",
  pageSize: 10,
} as const satisfies TransactionQuery;

/** Server-rendered data stays fresh this long before a background refetch. */
const STALE_MS = 30_000;

export const queryKeys = {
  overview: ["overview"] as const,
  insights: ["insights"] as const,
  accounts: ["accounts"] as const,
  account: (id: string) => ["accounts", id] as const,
  transactions: (filters: TransactionQuery) =>
    ["transactions", "list", normalizeFilters(filters)] as const,
  transaction: (id: string) => ["transactions", "detail", id] as const,
  recipients: ["recipients"] as const,
  cards: ["cards"] as const,
};

/** Drops empty values so `{}` and `{ q: "" }` share a cache entry. */
export function normalizeFilters(
  filters: TransactionQuery,
): Record<string, string> {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

export const overviewQuery = queryOptions({
  queryKey: queryKeys.overview,
  queryFn: ({ signal }) => api<OverviewDto>("/api/overview", { signal }),
  staleTime: STALE_MS,
});

export const insightsQuery = queryOptions({
  queryKey: queryKeys.insights,
  queryFn: ({ signal }) => api<InsightsDto>("/api/insights", { signal }),
  staleTime: STALE_MS,
});

export const accountsQuery = queryOptions({
  queryKey: queryKeys.accounts,
  queryFn: ({ signal }) => api<AccountDto[]>("/api/accounts", { signal }),
  staleTime: STALE_MS,
});

export const accountQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.account(id),
    queryFn: ({ signal }) =>
      api<AccountDetailDto>(`/api/accounts/${id}`, { signal }),
    staleTime: STALE_MS,
  });

export const transactionsQuery = (filters: TransactionQuery) =>
  queryOptions({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ signal }) =>
      api<TransactionListDto>(
        `/api/transactions${toQueryString(normalizeFilters(filters))}`,
        { signal },
      ),
    staleTime: STALE_MS,
    // Keep the current rows on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  });

export const transactionQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.transaction(id),
    queryFn: ({ signal }) =>
      api<TransactionDto>(`/api/transactions/${id}`, { signal }),
    staleTime: STALE_MS,
  });

export const recipientsQuery = queryOptions({
  queryKey: queryKeys.recipients,
  queryFn: ({ signal }) => api<RecipientDto[]>("/api/recipients", { signal }),
  staleTime: STALE_MS,
});

export const cardsQuery = queryOptions({
  queryKey: queryKeys.cards,
  queryFn: ({ signal }) => api<CardDto[]>("/api/cards", { signal }),
  staleTime: STALE_MS,
});
