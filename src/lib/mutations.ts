import type { QueryClient } from "@tanstack/react-query";
import { SETTLEMENT_DELAY_MS } from "./domain";

/**
 * Money moved, or a transaction changed: balances, lists, charts and card
 * spend can all be stale. Invalidating everything is simple and always right;
 * only the queries currently on screen actually refetch.
 */
export function refreshLedger(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries();
}

/** Slack after the settlement time, so the refetch lands once the server has posted it. */
const SETTLEMENT_GRACE_MS = 5_000;

/**
 * A payment that was just sent is pending and posts a little later. This
 * refreshes the ledger once more at that point, so whatever is on screen moves
 * from "Pending" to "Posted" without the person reloading.
 */
export function refreshAfterSettlement(
  queryClient: QueryClient,
): ReturnType<typeof setTimeout> {
  return setTimeout(
    () => void refreshLedger(queryClient),
    SETTLEMENT_DELAY_MS + SETTLEMENT_GRACE_MS,
  );
}

/** A fresh key per submission attempt, reused if that same attempt is retried. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
