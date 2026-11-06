import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/queries";
import { accounts, ids } from "../../../test/fixtures";
import {
  createTestQueryClient,
  renderWithProviders,
} from "../../../test/render";
import { AccountsView } from "./accounts-view";

function renderView(list = accounts) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.accounts, list);
  renderWithProviders(<AccountsView />, { queryClient });
}

const accountLink = (name: string) =>
  within(screen.getByRole("link", { name: new RegExp(name) }));

describe("AccountsView", () => {
  it("totals the balances across every account", () => {
    renderView();

    expect(
      screen.getByText("$1,750,000.00 across 3 accounts"),
    ).toBeInTheDocument();
  });

  it("shows zero when there are no accounts", () => {
    renderView([]);

    expect(screen.getByText("$0.00 across 0 accounts")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("links to a transfer between accounts", () => {
    renderView();

    expect(
      screen.getByRole("link", { name: "Transfer between accounts" }),
    ).toHaveAttribute("href", "/payments?new=transfer");
  });

  it("lists each account with its type, number ending and balance, linking to its page", () => {
    renderView();

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Operating Checking", "Savings Reserve", "Treasury"]);

    const checking = screen.getByRole("link", { name: /Operating Checking/ });
    expect(checking).toHaveAttribute("href", `/accounts/${ids.checking}`);
    expect(within(checking).getByText("Checking ••4821")).toBeInTheDocument();
    expect(within(checking).getByText("$250,000.00")).toBeInTheDocument();

    const savings = screen.getByRole("link", { name: /Savings Reserve/ });
    expect(savings).toHaveAttribute("href", `/accounts/${ids.savings}`);
    expect(within(savings).getByText("Savings ••7730")).toBeInTheDocument();
    expect(within(savings).getByText("$600,000.00")).toBeInTheDocument();

    const treasury = screen.getByRole("link", { name: /Treasury ••1094/ });
    expect(treasury).toHaveAttribute("href", `/accounts/${ids.treasury}`);
    expect(within(treasury).getByText("$900,000.00")).toBeInTheDocument();
  });

  it("shows the APY only on accounts that earn interest", () => {
    renderView();

    expect(accountLink("Savings Reserve").getByText("3.90% APY")).toBeVisible();
    expect(accountLink("Treasury ••1094").getByText("4.60% APY")).toBeVisible();
    expect(
      accountLink("Operating Checking").queryByText(/APY/),
    ).not.toBeInTheDocument();
  });
});
