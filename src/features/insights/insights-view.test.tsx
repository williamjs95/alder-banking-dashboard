import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { InsightsDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { ids, insights } from "../../../test/fixtures";
import {
  createTestQueryClient,
  renderWithProviders,
} from "../../../test/render";
import { InsightsView } from "./insights-view";

function renderView(data: InsightsDto = insights) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.insights, data);
  renderWithProviders(<InsightsView />, { queryClient });
  return { user: userEvent.setup() };
}

/** The card (stat tile or panel) that contains the given text. */
function cardWith(text: string) {
  const card = screen
    .getByText(text)
    .closest<HTMLElement>('[data-slot="card"]');
  if (!card) throw new Error(`No card containing "${text}"`);
  return within(card);
}

const cellText = (row: HTMLElement, role: "cell" | "columnheader") =>
  within(row)
    .getAllByRole(role)
    .map((cell) => cell.textContent?.trim());

describe("InsightsView", () => {
  it("shows average monthly spend and revenue in whole dollars", () => {
    renderView();

    const spend = cardWith("Average monthly spend");
    expect(spend.getByText("$261,926")).toBeInTheDocument();
    expect(spend.getByText("Last 3 full months")).toBeInTheDocument();

    const revenue = cardWith("Average monthly revenue");
    expect(revenue.getByText("$201,113")).toBeInTheDocument();
    expect(revenue.getByText("Last 3 full months")).toBeInTheDocument();
  });

  it("shows the largest expense as a positive amount linking to its transaction", () => {
    renderView();

    const tile = cardWith("Largest expense · 30 days");
    // The transaction is -$75,725.95; the tile reports the size of the expense.
    expect(tile.getByText("$75,726")).toBeInTheDocument();
    expect(
      tile.getByRole("link", { name: "Gusto Payroll · Jun 30" }),
    ).toHaveAttribute("href", `/transactions?tx=${ids.txScheduled}`);
    expect(
      tile.queryByText("No spend in the last 30 days"),
    ).not.toBeInTheDocument();
  });

  it("says there is no largest expense when nothing was spent", () => {
    renderView({ ...insights, largestExpense: null });

    const tile = cardWith("Largest expense · 30 days");
    expect(tile.getByText("None")).toBeInTheDocument();
    expect(tile.getByText("No spend in the last 30 days")).toBeInTheDocument();
    expect(tile.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ranks the top payees with their totals, payment counts and a search link", () => {
    renderView();

    const payees = cardWith("Top payees");
    expect(payees.getByText("Last 90 days")).toBeInTheDocument();

    const links = payees.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/transactions?q=Gusto%20Payroll&direction=out",
      "/transactions?q=Amazon%20Web%20Services&direction=out",
      "/transactions?q=Gunderson%20Dettmer%20LLP&direction=out",
    ]);

    const [gusto, aws, gunderson] = links.map((link) => within(link));
    expect(gusto.getByText("$450,848")).toBeInTheDocument();
    expect(gusto.getByText("6 payments")).toBeInTheDocument();
    expect(aws.getByText("$41,899")).toBeInTheDocument();
    expect(aws.getByText("3 payments")).toBeInTheDocument();
    expect(gunderson.getByText("$9,876")).toBeInTheDocument();
    // Singular for a single payment.
    expect(gunderson.getByText("1 payment")).toBeInTheDocument();
  });

  it("escapes payee names when building the search link", () => {
    renderView({
      ...insights,
      topMerchants: [{ description: "AT&T #42", cents: 120_00, count: 2 }],
    });

    expect(
      cardWith("Top payees").getByRole("link", { name: /AT&T #42/ }),
    ).toHaveAttribute("href", "/transactions?q=AT%26T%20%2342&direction=out");
  });

  it("compares each category's spend against the previous 30 days", () => {
    renderView();

    const table = cardWith("What changed").getByRole("table");
    const [header, ...rows] = within(table).getAllByRole("row");

    expect(cellText(header, "columnheader")).toEqual([
      "Category",
      "Last 30 days",
      "Previous 30 days",
      "Change",
    ]);
    expect(rows.map((row) => cellText(row, "cell"))).toEqual([
      ["Payroll", "$152,329", "$149,160", "Up+2.1%"],
      ["Taxes", "$42,835", "$51,072", "Down-16.1%"],
      ["Rent & office", "$8,400", "$8,400", "No change"],
      ["Travel & meals", "$0", "$1,525", "Down-100.0%"],
    ]);
  });

  it("offers the category trend as a table, folding categories past the fifth into Other", async () => {
    const { user } = renderView();
    const trend = cardWith(
      "Monthly spend for the last six months. The current month is partial.",
    );

    await user.click(trend.getByRole("button", { name: "Show as table" }));

    const table = screen.getByRole("table", { name: "Spend by category" });
    const [header, ...rows] = within(table).getAllByRole("row");
    expect(cellText(header, "columnheader")).toEqual([
      "Month",
      "Payroll",
      "Taxes",
      "Cloud & infrastructure",
      "Marketing",
      "Insurance & benefits",
      "Other",
      "Total",
    ]);
    // Newest month first. "Other" is software plus rent.
    expect(rows.map((row) => cellText(row, "cell"))).toEqual([
      [
        "June 2026",
        "$76,000.00",
        "$21,000.00",
        "$15,000.00",
        "$9,000.00",
        "$11,000.00",
        "$6,000.00",
        "$138,000.00",
      ],
      [
        "May 2026",
        "$150,000.00",
        "$42,000.00",
        "$16,000.00",
        "$14,000.00",
        "$12,000.00",
        "$16,400.00",
        "$250,400.00",
      ],
    ]);
  });
});
