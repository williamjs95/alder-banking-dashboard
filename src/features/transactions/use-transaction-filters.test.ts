import { act, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { ids } from "../../../test/fixtures";
import { useTransactionFilters } from "./use-transaction-filters";

const navigation = vi.hoisted(() => ({
  pathname: "/transactions",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

let replaceState: MockInstance<History["replaceState"]>;

/**
 * Puts `search` in the address bar and in `useSearchParams`, as it would be
 * after a navigation, then renders the hook.
 */
function setup(search = "") {
  window.history.replaceState(null, "", `/transactions${search}`);
  navigation.searchParams = new URLSearchParams(search);
  replaceState.mockClear();
  return renderHook(() => useTransactionFilters());
}

/** The URL the hook last wrote. */
const writtenUrl = () => replaceState.mock.lastCall?.[2];

beforeEach(() => {
  navigation.pathname = "/transactions";
  // The spy calls through, so jsdom's location really changes between updates.
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  replaceState.mockRestore();
  window.history.replaceState(null, "", "/");
});

describe("useTransactionFilters", () => {
  describe("reading", () => {
    it("returns no filters and no open transaction for a bare URL", () => {
      const { result } = setup();

      expect(result.current.filters).toEqual({});
      expect(result.current.openId).toBeNull();
    });

    it("reads every filter in the URL as a plain string", () => {
      const { result } = setup(
        `?q=stripe&accountId=${ids.checking}&category=cloud,payroll&status=pending&direction=out&from=2026-06-01&to=2026-06-30&minCents=1000&maxCents=5000&sort=amount&order=asc&page=2&pageSize=50`,
      );

      expect(result.current.filters).toEqual({
        q: "stripe",
        accountId: ids.checking,
        category: "cloud,payroll",
        status: "pending",
        direction: "out",
        from: "2026-06-01",
        to: "2026-06-30",
        minCents: "1000",
        maxCents: "5000",
        sort: "amount",
        order: "asc",
        page: "2",
        pageSize: "50",
      });
    });

    it("drops values that fail validation and keeps the valid ones", () => {
      const { result } = setup(
        "?q=aws&direction=sideways&pageSize=7&from=yesterday&status=failed",
      );

      expect(result.current.filters).toEqual({ q: "aws", status: "failed" });
    });

    it("ignores parameters that are not filters", () => {
      const { result } = setup("?utm_source=email&q=aws");

      expect(result.current.filters).toEqual({ q: "aws" });
    });

    it("exposes the open transaction id from `tx` without treating it as a filter", () => {
      const { result } = setup(`?tx=${ids.txAws}`);

      expect(result.current.openId).toBe(ids.txAws);
      expect(result.current.filters).toEqual({});
    });

    it("keeps the same filters object while the URL is unchanged", () => {
      const { result, rerender } = setup("?q=aws");
      const first = result.current.filters;

      rerender();

      expect(result.current.filters).toBe(first);
    });
  });

  describe("update", () => {
    it("writes a filter to the URL without adding a history entry", () => {
      const { result } = setup();
      const entries = window.history.length;

      act(() => result.current.update({ q: "stripe" }));

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(
        null,
        "",
        "/transactions?q=stripe",
      );
      expect(window.location.search).toBe("?q=stripe");
      expect(window.history.length).toBe(entries);
    });

    it("goes back to the first page when a filter changes", () => {
      const { result } = setup("?q=old&page=3");

      act(() => result.current.update({ q: "stripe" }));

      expect(writtenUrl()).toBe("/transactions?q=stripe");
    });

    it("goes back to the first page when the sort or the page size changes", () => {
      const { result } = setup("?page=3");

      act(() => result.current.update({ sort: "amount", order: "asc" }));
      expect(writtenUrl()).toBe("/transactions?sort=amount&order=asc");

      act(() => result.current.update({ page: "4" }));
      act(() => result.current.update({ pageSize: "50" }));
      expect(writtenUrl()).toBe(
        "/transactions?sort=amount&order=asc&pageSize=50",
      );
    });

    it("keeps the other filters when only the page changes", () => {
      const { result } = setup("?q=aws&status=pending&page=3");

      act(() => result.current.update({ page: "4" }));

      expect(writtenUrl()).toBe("/transactions?q=aws&status=pending&page=4");
    });

    it("keeps the page when a transaction is opened and when it is closed", () => {
      const { result } = setup("?q=aws&page=3");

      act(() => result.current.update({ tx: ids.txAws }));
      expect(writtenUrl()).toBe(`/transactions?q=aws&page=3&tx=${ids.txAws}`);

      act(() => result.current.update({ tx: undefined }));
      expect(writtenUrl()).toBe("/transactions?q=aws&page=3");
    });

    it("honours an explicit page sent together with a filter", () => {
      const { result } = setup("?page=3");

      act(() => result.current.update({ status: "failed", page: "2" }));

      expect(writtenUrl()).toBe("/transactions?page=2&status=failed");
    });

    it("removes a key when its value is empty or undefined", () => {
      const { result } = setup("?q=aws&status=pending&direction=out");

      act(() => result.current.update({ q: "", status: undefined }));

      expect(writtenUrl()).toBe("/transactions?direction=out");
    });

    it("writes the bare path when the last parameter is removed", () => {
      const { result } = setup("?q=aws");

      act(() => result.current.update({ q: "" }));

      expect(writtenUrl()).toBe("/transactions");
      expect(window.location.search).toBe("");
    });

    it("builds on the address bar, so two updates in a row both land", () => {
      // `useSearchParams` is deliberately left stale here: the second update
      // must not undo the first just because React has not re-rendered yet.
      const { result } = setup();

      act(() => {
        result.current.update({ q: "aws" });
        result.current.update({ direction: "out" });
      });

      expect(writtenUrl()).toBe("/transactions?q=aws&direction=out");
    });

    it("leaves parameters it does not own in place", () => {
      const { result } = setup("?utm_source=email");

      act(() => result.current.update({ q: "aws" }));

      expect(writtenUrl()).toBe("/transactions?utm_source=email&q=aws");
    });

    it("writes to whichever path the hook is mounted on", () => {
      navigation.pathname = "/accounts/activity";
      const { result } = setup();

      act(() => result.current.update({ q: "aws" }));

      expect(writtenUrl()).toBe("/accounts/activity?q=aws");
    });
  });

  describe("replaceFilters", () => {
    it("replaces every filter at once, clearing the ones left out and the page", () => {
      const { result } = setup(
        "?q=aws&status=pending&minCents=1000&sort=amount&order=asc&pageSize=50&page=3",
      );

      act(() =>
        result.current.replaceFilters({
          sort: "amount",
          order: "asc",
          pageSize: "50",
          direction: "in",
        }),
      );

      expect(writtenUrl()).toBe(
        "/transactions?sort=amount&order=asc&pageSize=50&direction=in",
      );
    });

    it("leaves the open transaction alone", () => {
      const { result } = setup(`?q=aws&tx=${ids.txAws}`);

      act(() => result.current.replaceFilters({}));

      expect(writtenUrl()).toBe(`/transactions?tx=${ids.txAws}`);
    });

    it("writes the bare path when no filters remain", () => {
      const { result } = setup("?q=aws&category=cloud&page=2");

      act(() => result.current.replaceFilters({}));

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(
        null,
        "",
        "/transactions",
      );
    });
  });
});
