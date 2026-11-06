import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "../../test/render";
import { SETTLEMENT_DELAY_MS } from "./domain";
import {
  newIdempotencyKey,
  refreshAfterSettlement,
  refreshLedger,
} from "./mutations";

describe("refreshAfterSettlement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the ledger only after the settlement time has passed", async () => {
    vi.useFakeTimers();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["transactions"], []);
    const invalidated = () =>
      queryClient.getQueryCache().getAll()[0].state.isInvalidated;

    refreshAfterSettlement(queryClient);

    await vi.advanceTimersByTimeAsync(SETTLEMENT_DELAY_MS);
    expect(invalidated()).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(invalidated()).toBe(true);
  });
});

describe("refreshLedger", () => {
  it("marks every cached query stale, whatever its key", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["overview"], { totalBalanceCents: 1 });
    queryClient.setQueryData(["transactions", "list", { page: "2" }], []);
    queryClient.setQueryData(["cards"], []);
    const invalidated = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.isInvalidated);
    expect(invalidated()).toEqual([false, false, false]);

    await refreshLedger(queryClient);

    expect(invalidated()).toEqual([true, true, true]);
  });

  it("keeps the cached data in place while it is stale", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["accounts"], [{ id: "a" }]);

    await refreshLedger(queryClient);

    expect(queryClient.getQueryData(["accounts"])).toEqual([{ id: "a" }]);
  });
});

describe("newIdempotencyKey", () => {
  it("is a version 4 UUID", () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("is different on every call", () => {
    const keys = Array.from({ length: 50 }, () => newIdempotencyKey());
    expect(new Set(keys).size).toBe(50);
  });
});
