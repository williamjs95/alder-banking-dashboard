import type { QueryClient } from "@tanstack/react-query";

/**
 * Money moved, or a transaction changed: balances, lists, charts and card
 * spend can all be stale. Invalidating everything is simple and always right;
 * only the queries currently on screen actually refetch.
 */
export function refreshLedger(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries();
}

/** A fresh key per submission attempt, reused if that same attempt is retried. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
