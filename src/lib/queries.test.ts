import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  accounts,
  cards,
  ids,
  insights,
  overview,
  recipients,
  transactionList,
  transactions,
} from "../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
} from "../../test/render";
import { ApiError } from "./api-client";
import {
  accountQuery,
  accountsQuery,
  cardsQuery,
  insightsQuery,
  normalizeFilters,
  overviewQuery,
  queryKeys,
  recipientsQuery,
  SCHEDULED_PAYMENTS,
  transactionQuery,
  transactionsQuery,
} from "./queries";

let fetchMock: MockInstance<typeof fetch>;
let queryClient: QueryClient;

/** Makes the next requests answer with `body`. A fresh Response per call. */
function respondWith(body: unknown) {
  fetchMock.mockImplementation(async () => jsonResponse(body));
}

/** The single URL requested so far. */
function requestedUrl(): string {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return String(fetchMock.mock.calls[0][0]);
}

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch");
  queryClient = createTestQueryClient();
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

describe("normalizeFilters", () => {
  it("drops undefined and empty values", () => {
    expect(
      normalizeFilters({ q: "", status: undefined, category: "cloud" }),
    ).toEqual({ category: "cloud" });
  });

  it("writes numbers as strings, keeping zero", () => {
    expect(normalizeFilters({ page: 2, pageSize: 50, minCents: 0 })).toEqual({
      page: "2",
      pageSize: "50",
      minCents: "0",
    });
  });

  it("orders keys alphabetically, whatever order they were given in", () => {
    expect(
      Object.keys(normalizeFilters({ status: "posted", q: "aws", page: 1 })),
    ).toEqual(["page", "q", "status"]);
  });
});

describe("queryKeys", () => {
  it("gives each read a stable key", () => {
    expect(queryKeys.overview).toEqual(["overview"]);
    expect(queryKeys.insights).toEqual(["insights"]);
    expect(queryKeys.accounts).toEqual(["accounts"]);
    expect(queryKeys.recipients).toEqual(["recipients"]);
    expect(queryKeys.cards).toEqual(["cards"]);
  });

  it("nests one account under the accounts list, so both invalidate together", () => {
    expect(queryKeys.account(ids.checking)).toEqual(["accounts", ids.checking]);
  });

  it("separates transaction lists from transaction details", () => {
    expect(queryKeys.transaction(ids.txAws)).toEqual([
      "transactions",
      "detail",
      ids.txAws,
    ]);
    expect(queryKeys.transactions({ q: "aws", page: 2 })).toEqual([
      "transactions",
      "list",
      { page: "2", q: "aws" },
    ]);
  });

  it("shares one cache entry between equivalent filter sets", () => {
    expect(queryKeys.transactions({ q: "" })).toEqual(
      queryKeys.transactions({}),
    );
    expect(queryKeys.transactions({ page: 2, q: "aws" })).toEqual(
      queryKeys.transactions({ q: "aws", page: "2" }),
    );
  });
});

describe("query definitions", () => {
  it("reads the overview", async () => {
    respondWith(overview);

    await expect(queryClient.fetchQuery(overviewQuery)).resolves.toEqual(
      overview,
    );

    expect(requestedUrl()).toBe("/api/overview");
    expect(queryClient.getQueryData(queryKeys.overview)).toEqual(overview);
  });

  it("reads insights", async () => {
    respondWith(insights);

    await expect(queryClient.fetchQuery(insightsQuery)).resolves.toEqual(
      insights,
    );

    expect(requestedUrl()).toBe("/api/insights");
  });

  it("reads the accounts list", async () => {
    respondWith(accounts);

    await expect(queryClient.fetchQuery(accountsQuery)).resolves.toEqual(
      accounts,
    );

    expect(requestedUrl()).toBe("/api/accounts");
  });

  it("reads one account by id", async () => {
    const detail = {
      account: accounts[0],
      balanceSeries: [],
      last30Days: { inflowCents: 0, outflowCents: 0 },
    };
    respondWith(detail);

    await expect(
      queryClient.fetchQuery(accountQuery(ids.checking)),
    ).resolves.toEqual(detail);

    expect(requestedUrl()).toBe(`/api/accounts/${ids.checking}`);
    expect(queryClient.getQueryData(queryKeys.account(ids.checking))).toEqual(
      detail,
    );
  });

  it("reads the transaction list with no query string when unfiltered", async () => {
    respondWith(transactionList);

    await expect(
      queryClient.fetchQuery(transactionsQuery({})),
    ).resolves.toEqual(transactionList);

    expect(requestedUrl()).toBe("/api/transactions");
  });

  it("sends transaction filters as a normalized query string", async () => {
    respondWith(transactionList);

    await queryClient.fetchQuery(
      transactionsQuery({
        status: "posted,pending",
        q: "aws",
        page: 2,
        direction: "",
      }),
    );

    expect(requestedUrl()).toBe(
      "/api/transactions?page=2&q=aws&status=posted%2Cpending",
    );
  });

  it("requests scheduled payments soonest first, ten at a time", async () => {
    respondWith(transactionList);

    await queryClient.fetchQuery(transactionsQuery(SCHEDULED_PAYMENTS));

    expect(requestedUrl()).toBe(
      "/api/transactions?order=asc&pageSize=10&status=scheduled",
    );
  });

  it("keeps the previous transaction rows on screen while the next set loads", () => {
    expect(transactionsQuery({ page: 2 }).placeholderData).toBe(
      keepPreviousData,
    );
  });

  it("reads one transaction by id", async () => {
    respondWith(transactions.aws);

    await expect(
      queryClient.fetchQuery(transactionQuery(ids.txAws)),
    ).resolves.toEqual(transactions.aws);

    expect(requestedUrl()).toBe(`/api/transactions/${ids.txAws}`);
  });

  it("reads recipients", async () => {
    respondWith(recipients);

    await expect(queryClient.fetchQuery(recipientsQuery)).resolves.toEqual(
      recipients,
    );

    expect(requestedUrl()).toBe("/api/recipients");
  });

  it("reads cards", async () => {
    respondWith(cards);

    await expect(queryClient.fetchQuery(cardsQuery)).resolves.toEqual(cards);

    expect(requestedUrl()).toBe("/api/cards");
  });

  it("makes every read a cancellable GET for JSON", async () => {
    respondWith({});

    await Promise.all([
      queryClient.fetchQuery(overviewQuery),
      queryClient.fetchQuery(insightsQuery),
      queryClient.fetchQuery(accountsQuery),
      queryClient.fetchQuery(accountQuery(ids.savings)),
      queryClient.fetchQuery(transactionsQuery({ q: "aws" })),
      queryClient.fetchQuery(transactionQuery(ids.txStripe)),
      queryClient.fetchQuery(recipientsQuery),
      queryClient.fetchQuery(cardsQuery),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(8);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({ Accept: "application/json" });
      expect(init?.body).toBeUndefined();
    }
  });

  it("serves a repeat read from the cache while the data is fresh", async () => {
    respondWith(accounts);

    await queryClient.fetchQuery(accountsQuery);
    await queryClient.fetchQuery(accountsQuery);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the data is older than 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      respondWith(accounts);

      await queryClient.fetchQuery(accountsQuery);
      vi.advanceTimersByTime(29_999);
      await queryClient.fetchQuery(accountsQuery);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2);
      await queryClient.fetchQuery(accountsQuery);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces the server's error to the caller", async () => {
    fetchMock.mockImplementation(async () =>
      errorResponse(404, "not_found", "Transaction not found."),
    );

    const failure = queryClient.fetchQuery(transactionQuery(ids.txFailed));

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "Transaction not found.",
    });
  });
});
