import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { OverviewDto } from "@/lib/contracts";
import { CATEGORIES } from "@/lib/domain";
import { queryKeys } from "@/lib/queries";
import { ids, overview } from "../../../test/fixtures";
import {
  createTestQueryClient,
  renderWithProviders,
} from "../../../test/render";
import { OverviewView } from "./overview-view";

function renderView(data: OverviewDto = overview) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.overview, data);
  renderWithProviders(<OverviewView />, { queryClient });
  return { user: userEvent.setup() };
}

/** The card (panel or stat tile) that contains the given heading or label. */
function cardWith(text: string) {
  const card = screen
    .getByText(text)
    .closest<HTMLElement>('[data-slot="card"]');
  if (!card) throw new Error(`No card containing "${text}"`);
  return within(card);
}

const hrefs = (links: HTMLElement[]) =>
  links.map((link) => link.getAttribute("href"));

/** Body rows of a chart's table twin, as arrays of cell text. */
function tableRows(name: string) {
  return within(screen.getByRole("table", { name }))
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
}

describe("OverviewView", () => {
  describe("total balance", () => {
    it("shows the balance and its change over the default 90 days", () => {
      renderView();
      const card = cardWith("Total balance");

      expect(card.getByText("$1,750,000")).toHaveTextContent("$1,750,000.00");
      expect(card.getByRole("radio", { name: "90D" })).toBeChecked();
      // 90 days ago the series stood at $1,661,000.
      expect(card.getByText("Up")).toBeInTheDocument();
      expect(card.getByText("+5.4%")).toBeInTheDocument();
      expect(card.getByText("in the last 90 days")).toBeInTheDocument();
    });

    it("recomputes the change and the chart window when the range changes", async () => {
      const { user } = renderView();
      const card = cardWith("Total balance");
      await user.click(card.getByRole("button", { name: "Show as table" }));

      expect(tableRows("Total balance")).toHaveLength(90);
      expect(tableRows("Total balance")[0]).toEqual([
        "Jun 18, 2026",
        "$1,750,000.00",
      ]);
      expect(tableRows("Total balance").at(-1)).toEqual([
        "Mar 21, 2026",
        "$1,661,000.00",
      ]);

      await user.click(card.getByRole("radio", { name: "30D" }));

      expect(card.getByText("+1.7%")).toBeInTheDocument();
      expect(card.getByText("in the last 30 days")).toBeInTheDocument();
      expect(tableRows("Total balance")).toHaveLength(30);
      expect(tableRows("Total balance").at(-1)).toEqual([
        "May 20, 2026",
        "$1,721,000.00",
      ]);

      await user.click(card.getByRole("radio", { name: "1Y" }));

      expect(card.getByText("+26.3%")).toBeInTheDocument();
      expect(card.getByText("in the last year")).toBeInTheDocument();
      expect(tableRows("Total balance")).toHaveLength(365);
      expect(tableRows("Total balance").at(-1)).toEqual([
        "Jun 19, 2025",
        "$1,386,000.00",
      ]);
    });

    it("reports no change when there is no balance history to compare with", () => {
      renderView({ ...overview, balanceSeries: [] });

      const card = cardWith("Total balance");
      expect(card.getByText("$1,750,000")).toHaveTextContent("$1,750,000.00");
      expect(
        card.getByText("No change in the last 90 days"),
      ).toBeInTheDocument();
    });
  });

  describe("accounts", () => {
    it("lists every account with its details, balance and a link to its page", () => {
      renderView();
      const card = cardWith("Accounts");

      const checking = card.getByRole("link", { name: /Operating Checking/ });
      expect(checking).toHaveAttribute("href", `/accounts/${ids.checking}`);
      expect(within(checking).getByText("Checking ••4821")).toBeInTheDocument();
      expect(within(checking).getByText("$250,000.00")).toBeInTheDocument();

      const savings = card.getByRole("link", { name: /Savings Reserve/ });
      expect(savings).toHaveAttribute("href", `/accounts/${ids.savings}`);
      expect(
        within(savings).getByText("Savings ••7730 · 3.90% APY"),
      ).toBeInTheDocument();
      expect(within(savings).getByText("$600,000.00")).toBeInTheDocument();

      const treasury = card.getByRole("link", { name: /Treasury ••1094/ });
      expect(treasury).toHaveAttribute("href", `/accounts/${ids.treasury}`);
      expect(
        within(treasury).getByText("Treasury ••1094 · 4.60% APY"),
      ).toBeInTheDocument();

      expect(card.getByRole("link", { name: "View all" })).toHaveAttribute(
        "href",
        "/accounts",
      );
    });

    it("offers quick actions that open the right dialog on the right page", () => {
      renderView();
      const card = cardWith("Accounts");

      expect(card.getByRole("link", { name: "Send" })).toHaveAttribute(
        "href",
        "/payments?new=payment",
      );
      expect(card.getByRole("link", { name: "Transfer" })).toHaveAttribute(
        "href",
        "/payments?new=transfer",
      );
      expect(card.getByRole("link", { name: "New card" })).toHaveAttribute(
        "href",
        "/cards?new=card",
      );
    });
  });

  describe("30-day figures", () => {
    it("shows money in and out against the previous 30 days", () => {
      renderView();

      const moneyIn = cardWith("Money in · 30 days");
      expect(moneyIn.getByText("$212,062")).toBeInTheDocument();
      expect(moneyIn.getByText("+3.4%")).toBeInTheDocument();
      expect(moneyIn.getByText("vs previous 30 days")).toBeInTheDocument();

      const moneyOut = cardWith("Money out · 30 days");
      expect(moneyOut.getByText("$274,530")).toBeInTheDocument();
      expect(moneyOut.getByText("+4.4%")).toBeInTheDocument();
      expect(moneyOut.getByText("vs previous 30 days")).toBeInTheDocument();
    });

    it("shows a negative net cash flow when more went out than came in", () => {
      renderView();

      const net = cardWith("Net cash flow · 30 days");
      expect(net.getByText("-$62,468")).toBeInTheDocument();
      expect(
        net.getByText("Excludes transfers between your accounts"),
      ).toBeInTheDocument();
    });

    it("shows the runway and the burn behind it while the company is burning cash", () => {
      renderView();

      const runway = cardWith("Runway");
      expect(runway.getByText("28.7 months")).toBeInTheDocument();
      expect(
        runway.getByText("$60,814 average monthly burn"),
      ).toBeInTheDocument();
      expect(runway.queryByText("Not burning")).not.toBeInTheDocument();
    });

    it("says the company is not burning when cash flow is positive", () => {
      renderView({
        ...overview,
        last30Days: { inflowCents: 300_000_00, outflowCents: 290_000_00 },
        monthlyBurnCents: -12_000_00,
        runwayMonths: null,
      });

      const runway = cardWith("Runway");
      expect(runway.getByText("Not burning")).toBeInTheDocument();
      expect(
        runway.getByText("Cash flow positive over the last 3 months"),
      ).toBeInTheDocument();
      expect(
        runway.queryByText(/average monthly burn/),
      ).not.toBeInTheDocument();
      // A positive net is signed, so it cannot be mistaken for an outflow.
      expect(
        cardWith("Net cash flow · 30 days").getByText("+$10,000"),
      ).toBeInTheDocument();
    });
  });

  describe("cash flow", () => {
    it("offers the monthly figures as a table, newest month first", async () => {
      const { user } = renderView();

      await user.click(
        cardWith("Cash flow").getByRole("button", { name: "Show as table" }),
      );

      expect(tableRows("Cash flow")).toEqual([
        ["June 2026", "$130,000.00", "$160,000.00", "-$30,000.00"],
        ["May 2026", "$210,000.00", "$265,000.00", "-$55,000.00"],
        ["April 2026", "$200,000.00", "$260,000.00", "-$60,000.00"],
      ]);
    });
  });

  describe("spend by category", () => {
    it("totals the spend and links each category to its transactions since 30 days before the latest balance", () => {
      renderView();
      const card = cardWith("Spend by category");

      expect(
        card.getByText("$213,492 in the last 30 days"),
      ).toBeInTheDocument();
      const links = card.getAllByRole("link");
      // The series ends on Jun 18, 2026; 30 days earlier is May 19.
      expect(hrefs(links)).toEqual([
        "/transactions?category=payroll&direction=out&from=2026-05-19",
        "/transactions?category=taxes&direction=out&from=2026-05-19",
        "/transactions?category=cloud&direction=out&from=2026-05-19",
      ]);
      expect(links.map((link) => link.textContent)).toEqual([
        "Payroll$152,329",
        "Taxes$42,835",
        "Cloud & infrastructure$18,328",
      ]);
    });

    it("leaves the date out of the links when there is no balance history", () => {
      renderView({ ...overview, balanceSeries: [] });

      expect(hrefs(cardWith("Spend by category").getAllByRole("link"))).toEqual(
        [
          "/transactions?category=payroll&direction=out",
          "/transactions?category=taxes&direction=out",
          "/transactions?category=cloud&direction=out",
        ],
      );
    });

    it("charts the seven largest categories but totals all of them", () => {
      const eight = CATEGORIES.slice(1, 9).map((category, index) => ({
        category,
        cents: (8 - index) * 1_000_00,
      }));
      renderView({ ...overview, spendByCategory: eight });
      const card = cardWith("Spend by category");

      expect(card.getAllByRole("link")).toHaveLength(7);
      expect(card.getByText("Travel & meals")).toBeInTheDocument();
      // The eighth, Professional services, is counted but not drawn.
      expect(card.queryByText("Professional services")).not.toBeInTheDocument();
      expect(card.getByText("$36,000 in the last 30 days")).toBeInTheDocument();
    });

    it("explains an empty chart when nothing was spent", () => {
      renderView({ ...overview, spendByCategory: [] });
      const card = cardWith("Spend by category");

      expect(card.getByText("$0 in the last 30 days")).toBeInTheDocument();
      expect(card.getByText("No spend yet")).toBeInTheDocument();
      expect(
        card.getByText(
          "Outgoing payments from the last 30 days will be grouped here.",
        ),
      ).toBeInTheDocument();
      expect(card.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  describe("recent transactions", () => {
    it("lists the latest transactions, each opening its detail", () => {
      renderView();
      const card = cardWith("Recent transactions");

      expect(card.getByRole("link", { name: "View all" })).toHaveAttribute(
        "href",
        "/transactions",
      );
      const stripe = card.getByRole("link", { name: /Stripe/ });
      expect(stripe).toHaveAttribute(
        "href",
        `/transactions?tx=${ids.txStripe}`,
      );
      expect(within(stripe).getByText("+$11,048.20")).toBeInTheDocument();
      expect(
        card.getByRole("link", { name: /Amazon Web Services/ }),
      ).toHaveAttribute("href", `/transactions?tx=${ids.txAws}`);
      const failed = card.getByRole("link", { name: /Hartwell Staffing/ });
      expect(failed).toHaveAttribute(
        "href",
        `/transactions?tx=${ids.txFailed}`,
      );
      expect(within(failed).getByText("Failed")).toBeInTheDocument();
      expect(card.queryByText("No transactions yet")).not.toBeInTheDocument();
    });

    it("explains the empty list on a brand-new workspace", () => {
      renderView({ ...overview, recent: [] });
      const card = cardWith("Recent transactions");

      expect(card.getByText("No transactions yet")).toBeInTheDocument();
      expect(
        card.getByText("Activity on your accounts will show up here."),
      ).toBeInTheDocument();
      expect(hrefs(card.getAllByRole("link"))).toEqual(["/transactions"]);
    });
  });

  describe("upcoming payments", () => {
    it("lists scheduled payments with their due date and amount", () => {
      renderView();
      const card = cardWith("Upcoming payments");

      expect(card.getByRole("link", { name: "View all" })).toHaveAttribute(
        "href",
        "/transactions?status=scheduled&order=asc",
      );
      const payroll = card.getByRole("link", { name: /Gusto Payroll/ });
      expect(payroll).toHaveAttribute(
        "href",
        `/transactions?tx=${ids.txScheduled}`,
      );
      expect(within(payroll).getByText("Due Jun 30")).toBeInTheDocument();
      expect(within(payroll).getByText("-$75,725.95")).toBeInTheDocument();
      expect(card.queryByText("Nothing scheduled")).not.toBeInTheDocument();
    });

    it("says nothing is scheduled when the list is empty", () => {
      renderView({ ...overview, upcoming: [] });
      const card = cardWith("Upcoming payments");

      expect(card.getByText("Nothing scheduled")).toBeInTheDocument();
      expect(
        card.getByText(
          "Payments you schedule for a future date will appear here.",
        ),
      ).toBeInTheDocument();
      expect(hrefs(card.getAllByRole("link"))).toEqual([
        "/transactions?status=scheduled&order=asc",
      ]);
    });
  });
});
