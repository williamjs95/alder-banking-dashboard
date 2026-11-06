import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDetailDto, TransactionListDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import {
  accounts,
  balanceSeries,
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
import { AccountDetailView } from "./account-detail-view";

const fetchMock = vi.fn<typeof fetch>();
const [checking, savings] = accounts;

/** A year of daily balances ending at $600,000 on Jun 18, 2026, up $1,000 a day. */
const savingsDetail: AccountDetailDto = {
  account: savings,
  balanceSeries: balanceSeries(365, savings.balanceCents),
  last30Days: { inflowCents: 12_340_00, outflowCents: 5_678_90 },
};

const recentList: TransactionListDto = {
  ...transactionList,
  items: [transactions.stripe, transactions.aws],
  total: 2,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/** Answers the recent-activity request; any other request fails the test. */
function serveRecent(response: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/transactions?")) return response();
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderView(detail: AccountDetailDto = savingsDetail) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.account(detail.account.id), detail);
  const view = renderWithProviders(
    <AccountDetailView accountId={detail.account.id} />,
    { queryClient },
  );
  return { ...view, user: userEvent.setup() };
}

/** The stat tile with the given label. */
function tile(label: string) {
  const card = screen
    .getByText(label)
    .closest<HTMLElement>('[data-slot="card"]');
  if (!card) throw new Error(`No tile labelled "${label}"`);
  return within(card);
}

/** Body rows of the balance table, as [date, balance] text pairs. */
function balanceRows() {
  const table = screen.getByRole("table", { name: "Available balance" });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
}

describe("AccountDetailView", () => {
  it("heads the page with the account, its type, number ending and APY", () => {
    serveRecent(() => jsonResponse(recentList));
    renderView();

    expect(
      screen.getByRole("heading", { level: 1, name: "Savings Reserve" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Savings ••7730 · 3.90% APY")).toBeInTheDocument();
    expect(screen.getByText("$600,000.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All accounts" })).toHaveAttribute(
      "href",
      "/accounts",
    );
  });

  it("leaves the APY out for an account that earns none", () => {
    serveRecent(() => jsonResponse(recentList));
    renderView({ ...savingsDetail, account: checking });

    expect(
      screen.getByRole("heading", { level: 1, name: "Operating Checking" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Checking ••4821")).toBeInTheDocument();
    expect(screen.queryByText(/APY/)).not.toBeInTheDocument();
  });

  it("shows money in and out for the last 30 days in whole dollars", () => {
    serveRecent(() => jsonResponse(recentList));
    renderView();

    expect(tile("Money in · 30 days").getByText("$12,340")).toBeInTheDocument();
    expect(tile("Money out · 30 days").getByText("$5,679")).toBeInTheDocument();
  });

  it("charts the last 90 days by default and re-slices when the range changes", async () => {
    serveRecent(() => jsonResponse(recentList));
    const { user } = renderView();
    const range = within(
      screen.getByRole("radiogroup", { name: "Balance history range" }),
    );

    expect(range.getByRole("radio", { name: "90D" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Show as table" }));

    // Newest first: today's balance down to the first day of the window.
    expect(balanceRows()).toHaveLength(90);
    expect(balanceRows()[0]).toEqual(["Jun 18, 2026", "$600,000.00"]);
    expect(balanceRows().at(-1)).toEqual(["Mar 21, 2026", "$511,000.00"]);

    await user.click(range.getByRole("radio", { name: "30D" }));

    expect(range.getByRole("radio", { name: "30D" })).toBeChecked();
    expect(range.getByRole("radio", { name: "90D" })).not.toBeChecked();
    expect(balanceRows()).toHaveLength(30);
    expect(balanceRows()[0]).toEqual(["Jun 18, 2026", "$600,000.00"]);
    expect(balanceRows().at(-1)).toEqual(["May 20, 2026", "$571,000.00"]);

    await user.click(range.getByRole("radio", { name: "1Y" }));

    expect(range.getByRole("radio", { name: "1Y" })).toBeChecked();
    expect(balanceRows()).toHaveLength(365);
    expect(balanceRows().at(-1)).toEqual(["Jun 19, 2025", "$236,000.00"]);
  });

  it("shows the account's numbers masked, and reveals them on request", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input) === `/api/accounts/${ids.savings}/numbers`
        ? jsonResponse({
            accountNumber: "000987657730",
            routingNumber: "021000021",
          })
        : jsonResponse(recentList),
    );
    const { user } = renderView();

    expect(screen.getByText("••••••••7730")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show numbers" }));

    expect(await screen.findByText("000987657730")).toBeInTheDocument();
    expect(screen.getByText("021000021")).toBeInTheDocument();
  });

  it("requests the ten latest transactions for this account and lists them", async () => {
    serveRecent(() => jsonResponse(recentList));
    renderView();

    const stripe = await screen.findByRole("link", { name: /Stripe/ });
    expect(stripe).toHaveAttribute("href", `/transactions?tx=${ids.txStripe}`);
    expect(within(stripe).getByText("+$11,048.20")).toBeInTheDocument();
    const aws = screen.getByRole("link", { name: /Amazon Web Services/ });
    expect(aws).toHaveAttribute("href", `/transactions?tx=${ids.txAws}`);
    expect(within(aws).getByText("-$15,137.39")).toBeInTheDocument();
    expect(within(aws).getByText("Pending")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/transactions?accountId=${ids.savings}&pageSize=10`,
    );
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
  });

  it("links to the full transaction list filtered to this account", () => {
    serveRecent(() => jsonResponse(recentList));
    renderView();

    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      `/transactions?accountId=${ids.savings}`,
    );
  });

  it("holds a placeholder while recent activity loads", async () => {
    let respond!: (response: Response) => void;
    serveRecent(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    const { container } = renderView();
    const placeholder = () => container.querySelector('[aria-busy="true"]');

    expect(placeholder()).toBeInTheDocument();
    expect(
      placeholder()?.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(5);
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Activity could not load"),
    ).not.toBeInTheDocument();

    respond(jsonResponse(recentList));

    expect(
      await screen.findByRole("link", { name: /Stripe/ }),
    ).toBeInTheDocument();
    expect(placeholder()).not.toBeInTheDocument();
  });

  it("says so when recent activity cannot load", async () => {
    serveRecent(() => errorResponse(500, "internal_error", "Database is down"));
    renderView();

    expect(
      await screen.findByText("Activity could not load"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Open the full transaction list to try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Stripe/ }),
    ).not.toBeInTheDocument();
  });

  it("says so when the account has no transactions yet", async () => {
    serveRecent(() =>
      jsonResponse({
        ...transactionList,
        items: [],
        total: 0,
        summary: { inflowCents: 0, outflowCents: 0, netCents: 0 },
      }),
    );
    renderView();

    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(
      screen.getByText("Transactions on this account will show up here."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Activity could not load"),
    ).not.toBeInTheDocument();
  });
});
