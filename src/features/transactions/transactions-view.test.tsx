import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { toQueryString } from "@/lib/api-client";
import type { TransactionListDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import type { RawFilters } from "@/lib/transaction-filters";
import {
  accounts,
  ids,
  transactionList,
  transactions,
} from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { TransactionsView } from "./transactions-view";

/**
 * Next.js mirrors History API updates into `useSearchParams`. This stand-in
 * does the same: the hooks read the real jsdom location and re-render when the
 * `replaceState` spy reports a change, so a click that writes a filter to the
 * URL changes what the view shows, exactly as it does in the app.
 */
const navigation = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () => {
      const search = useSyncExternalStore(
        navigation.subscribe,
        () => window.location.search,
      );
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const emptyList: TransactionListDto = {
  ...transactionList,
  items: [],
  total: 0,
  summary: { inflowCents: 0, outflowCents: 0, netCents: 0 },
};

const fetchMock = vi.fn<typeof fetch>();
let replaceState: MockInstance<History["replaceState"]>;

/** A promise settled by the test, for holding a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * The API behind the view. The list endpoint answers every query with `list`;
 * the detail endpoint knows the fixture transactions.
 */
function serve(list: TransactionListDto = transactionList) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === "/api/transactions") return jsonResponse(list);
    const found = Object.values(transactions).find(
      (item) => url.pathname === `/api/transactions/${item.id}`,
    );
    return found
      ? jsonResponse(found)
      : errorResponse(404, "not_found", "Transaction not found");
  });
}

/** The URLs requested so far, in order. */
const requested = () => fetchMock.mock.calls.map(([input]) => String(input));

/**
 * Renders the view at `/transactions` with `filters` (and `tx`) in the URL.
 * `cached` is the list already in the cache for those filters, as it is after
 * server rendering; pass `null` to make the view fetch it.
 */
function setup({
  filters = {},
  tx,
  cached = transactionList,
}: {
  filters?: RawFilters;
  tx?: string;
  cached?: TransactionListDto | null;
} = {}) {
  window.history.replaceState(
    null,
    "",
    `/transactions${toQueryString({ ...filters, tx })}`,
  );
  replaceState.mockClear();

  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.accounts, accounts);
  if (cached) {
    queryClient.setQueryData(queryKeys.transactions(filters), cached);
  }
  const { container } = renderWithProviders(<TransactionsView />, {
    queryClient,
  });
  return { container, queryClient, user: userEvent.setup() };
}

/** The value beside `label` in the summary strip. */
const summary = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling;

// The desktop table and the mobile list both render in jsdom; rows are
// counted in the table.
const table = () => within(screen.getByRole("table"));
const rowCount = () => table().getAllByRole("row").length - 1;
const ledger = () => screen.getByRole("table").closest("[aria-busy]");
const emptyState = () =>
  within(screen.getByText("No transactions match").parentElement!);

beforeEach(() => {
  const native = window.history.replaceState.bind(window.history);
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((...args) => {
      native(...args);
      navigation.notify();
    });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  serve();
});

afterEach(() => {
  replaceState.mockRestore();
  window.history.replaceState(null, "", "/");
});

describe("TransactionsView", () => {
  describe("summary", () => {
    it("totals every transaction when nothing is filtered", () => {
      setup();

      expect(summary("Transactions")).toHaveTextContent("5");
      expect(summary("Money in")).toHaveTextContent("$11,048.20");
      expect(summary("Money out")).toHaveTextContent("-$150,863.34");
      expect(summary("Net")).toHaveTextContent("-$139,815.14");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("calls the count “Matching” when a filter is applied, and signs a positive net", () => {
      setup({
        filters: { direction: "in" },
        cached: {
          ...transactionList,
          items: [transactions.stripe],
          total: 1_204,
          summary: {
            inflowCents: 11_048_20,
            outflowCents: 0,
            netCents: 11_048_20,
          },
        },
      });

      expect(summary("Matching")).toHaveTextContent("1,204");
      expect(
        screen.queryByText("Transactions", { selector: "dt" }),
      ).not.toBeInTheDocument();
      expect(summary("Money out")).toHaveTextContent("$0.00");
      expect(summary("Net")).toHaveTextContent("+$11,048.20");
    });

    it("does not count sorting or paging as a filter", () => {
      setup({ filters: { sort: "amount", order: "asc", pageSize: "50" } });

      expect(summary("Transactions")).toHaveTextContent("5");
    });
  });

  describe("loading", () => {
    it("shows placeholders while the first page loads, then the rows", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);
      const { container } = setup({ cached: null });

      expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Money in", { selector: "dt" }),
      ).not.toBeInTheDocument();
      expect(requested()).toEqual(["/api/transactions"]);

      response.resolve(jsonResponse(transactionList));

      expect(await screen.findByRole("table")).toBeVisible();
      expect(rowCount()).toBe(5);
      expect(summary("Transactions")).toHaveTextContent("5");
    });

    it("requests the list with the filters from the URL", async () => {
      setup({
        filters: { q: "hartwell", status: "failed", page: "2" },
        cached: null,
      });

      expect(await screen.findByRole("table")).toBeVisible();
      expect(requested()).toEqual([
        "/api/transactions?page=2&q=hartwell&status=failed",
      ]);
    });

    it("ignores an invalid filter in the URL instead of sending it", async () => {
      window.history.replaceState(null, "", "/transactions?direction=sideways");
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(queryKeys.accounts, accounts);
      renderWithProviders(<TransactionsView />, { queryClient });

      expect(await screen.findByRole("table")).toBeVisible();
      expect(requested()).toEqual(["/api/transactions"]);
      expect(summary("Transactions")).toHaveTextContent("5");
    });
  });

  describe("when the list cannot load", () => {
    it("says why and recovers with “Try again”", async () => {
      fetchMock.mockResolvedValueOnce(
        errorResponse(500, "internal_error", "The ledger is unavailable"),
      );
      const { user } = setup({ cached: null });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Transactions could not load");
      expect(alert).toHaveTextContent("The ledger is unavailable");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("table")).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(requested()).toEqual(["/api/transactions", "/api/transactions"]);
    });

    it("keeps the filters usable so a different search can be tried", async () => {
      fetchMock.mockResolvedValueOnce(
        errorResponse(500, "internal_error", "The ledger is unavailable"),
      );
      setup({ filters: { q: "aws" }, cached: null });

      expect(await screen.findByRole("alert")).toBeVisible();
      expect(
        screen.getByRole("searchbox", { name: "Search transactions" }),
      ).toHaveValue("aws");
    });
  });

  describe("when nothing matches", () => {
    it("says so, with zeroed totals and no table or paging", () => {
      setup({ cached: emptyList });

      expect(screen.getByText("No transactions match")).toBeVisible();
      expect(summary("Transactions")).toHaveTextContent("0");
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("navigation", { name: "Pagination" }),
      ).not.toBeInTheDocument();
    });

    it("offers nothing to clear when no filter is applied", () => {
      setup({ cached: emptyList });

      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument();
    });

    it("clears the filters from the empty state, keeping the sort", async () => {
      const { user } = setup({
        filters: { q: "nothing like this", status: "failed", sort: "amount" },
        cached: emptyList,
      });
      expect(summary("Matching")).toHaveTextContent("0");

      await user.click(
        emptyState().getByRole("button", { name: "Clear filters" }),
      );

      expect(window.location.search).toBe("?sort=amount");
      expect(await screen.findByRole("table")).toBeVisible();
      expect(requested()).toEqual(["/api/transactions?sort=amount"]);
      expect(summary("Transactions")).toHaveTextContent("5");
    });
  });

  describe("table", () => {
    it("lists the transactions with the default sort, newest first", () => {
      setup();

      expect(rowCount()).toBe(5);
      expect(
        table().getByRole("columnheader", { name: "Date" }),
      ).toHaveAttribute("aria-sort", "descending");
      expect(ledger()).toHaveAttribute("aria-busy", "false");
    });

    it("sorts by a column, keeping the current rows on screen until the new ones arrive", async () => {
      const { user } = setup();
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);

      await user.click(table().getByRole("button", { name: "Amount" }));

      expect(window.location.search).toBe("?sort=amount&order=desc");
      expect(requested()).toEqual(["/api/transactions?order=desc&sort=amount"]);
      expect(rowCount()).toBe(5);
      expect(ledger()).toHaveAttribute("aria-busy", "true");

      response.resolve(
        jsonResponse({
          ...transactionList,
          items: [transactions.stripe, transactions.failed],
        }),
      );

      await waitFor(() =>
        expect(ledger()).toHaveAttribute("aria-busy", "false"),
      );
      expect(rowCount()).toBe(2);
      expect(
        table().getByRole("columnheader", { name: "Amount" }),
      ).toHaveAttribute("aria-sort", "descending");
    });

    it("flips the direction when the active column is clicked again", async () => {
      const { user } = setup({ filters: { sort: "amount", order: "desc" } });

      await user.click(table().getByRole("button", { name: "Amount" }));

      expect(window.location.search).toBe("?sort=amount&order=asc");
      await waitFor(() =>
        expect(
          table().getByRole("columnheader", { name: "Amount" }),
        ).toHaveAttribute("aria-sort", "ascending"),
      );
    });

    it("returns to the first page when the sort changes", async () => {
      const { user } = setup({ filters: { page: "3" } });

      await user.click(table().getByRole("button", { name: "Description" }));

      expect(window.location.search).toBe("?sort=description&order=asc");
    });
  });

  describe("paging", () => {
    const secondPage: TransactionListDto = {
      ...transactionList,
      total: 60,
      page: 2,
      pageSize: 25,
      pageCount: 3,
    };

    it("describes where the reader is in the result set", () => {
      setup({ filters: { page: "2" }, cached: secondPage });

      const nav = screen.getByRole("navigation", { name: "Pagination" });
      expect(nav).toHaveTextContent("26–50 of 60");
      expect(nav).toHaveTextContent("Page 2 of 3");
    });

    it("moves to the next and the previous page through the URL", async () => {
      const { user } = setup({ filters: { page: "2" }, cached: secondPage });
      serve(secondPage);

      await user.click(screen.getByRole("button", { name: "Next page" }));
      expect(window.location.search).toBe("?page=3");
      await waitFor(() =>
        expect(requested()).toEqual(["/api/transactions?page=3"]),
      );

      await user.click(screen.getByRole("button", { name: "Previous page" }));
      expect(window.location.search).toBe("?page=1");
    });

    it("keeps the filters when the page changes", async () => {
      const { user } = setup({
        filters: { status: "posted", page: "2" },
        cached: secondPage,
      });

      await user.click(screen.getByRole("button", { name: "Next page" }));

      expect(window.location.search).toBe("?status=posted&page=3");
    });

    it("changes the page size and starts again from the first page", async () => {
      const { user } = setup({ filters: { page: "2" }, cached: secondPage });

      await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
      await user.click(screen.getByRole("option", { name: "50 per page" }));

      expect(window.location.search).toBe("?pageSize=50");
      await waitFor(() =>
        expect(requested()).toEqual(["/api/transactions?pageSize=50"]),
      );
    });
  });

  describe("filters", () => {
    it("offers the workspace's accounts", async () => {
      const { user } = setup();

      await user.click(screen.getByRole("combobox", { name: "Account" }));

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual([
        "All accounts",
        "Operating Checking",
        "Savings Reserve",
        "Treasury",
      ]);
    });

    it("writes a filter to the URL, returns to page one and refetches", async () => {
      const { user } = setup({ filters: { page: "2" } });

      await user.click(screen.getByRole("combobox", { name: "Direction" }));
      await user.click(screen.getByRole("option", { name: "Money out" }));

      expect(window.location.search).toBe("?direction=out");
      await waitFor(() =>
        expect(requested()).toEqual(["/api/transactions?direction=out"]),
      );
      expect(await screen.findByText("Matching")).toBeVisible();
    });

    it("searches a moment after typing stops", async () => {
      const { user } = setup();

      await user.type(
        screen.getByRole("searchbox", { name: "Search transactions" }),
        "gusto",
      );

      await waitFor(() => expect(window.location.search).toBe("?q=gusto"));
      await waitFor(() =>
        expect(requested()).toEqual(["/api/transactions?q=gusto"]),
      );
    });

    it("clears every filter from the bar", async () => {
      const { user } = setup({
        filters: { q: "aws", category: "cloud", pageSize: "50" },
      });

      await user.click(screen.getByRole("button", { name: "Clear filters" }));

      expect(window.location.search).toBe("?pageSize=50");
      expect(
        screen.getByRole("searchbox", { name: "Search transactions" }),
      ).toHaveValue("");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Clear filters" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("links the export to the filtered view, without paging", () => {
      setup({ filters: { status: "failed", page: "2", pageSize: "50" } });

      expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
        "href",
        "/api/transactions/export?status=failed",
      );
    });
  });

  describe("transaction detail", () => {
    it("is closed, and requests nothing, until a transaction is chosen", () => {
      setup();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("opens from a row, showing the row's data at once, and puts the id in the URL", async () => {
      const { user } = setup({ filters: { q: "a", page: "2" } });
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);

      await user.click(
        table().getByRole("button", { name: "Amazon Web Services" }),
      );

      // Opening a transaction is not a filter change: the page stays.
      expect(window.location.search).toBe(`?q=a&page=2&tx=${ids.txAws}`);
      const dialog = screen.getByRole("dialog", {
        name: "Amazon Web Services",
      });
      expect(within(dialog).getByText("ALD-AWS00001")).toBeVisible();
      expect(requested()).toEqual([`/api/transactions/${ids.txAws}`]);
      response.resolve(jsonResponse(transactions.aws));
    });

    it("opens the transaction named in the URL on arrival", () => {
      setup({ tx: ids.txFailed });

      const dialog = screen.getByRole("dialog", { name: "Hartwell Staffing" });
      expect(within(dialog).getByText("ALD-FAILED01")).toBeVisible();
      expect(within(dialog).getByRole("textbox", { name: "Note" })).toHaveValue(
        transactions.failed.note,
      );
    });

    it("fetches a linked transaction that is not on the current page", async () => {
      setup({
        tx: ids.txFailed,
        cached: { ...transactionList, items: [transactions.stripe] },
      });

      expect(screen.getByRole("dialog", { name: "Loading…" })).toBeVisible();
      expect(
        await screen.findByRole("dialog", { name: "Hartwell Staffing" }),
      ).toBeVisible();
      expect(requested()).toEqual([`/api/transactions/${ids.txFailed}`]);
    });

    it("says so when the linked transaction does not exist", async () => {
      setup({ tx: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9" });

      expect(
        await screen.findByRole("dialog", { name: "Transaction unavailable" }),
      ).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Transaction not found",
      );
    });

    it("closes by removing the id from the URL, keeping filters and page", async () => {
      const { user } = setup({
        filters: { status: "failed", page: "2" },
        tx: ids.txFailed,
      });

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(window.location.search).toBe("?status=failed&page=2");
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(rowCount()).toBe(5);
    });
  });
});
