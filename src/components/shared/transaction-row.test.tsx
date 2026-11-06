import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ids, transactions } from "../../../test/fixtures";
import { TransactionRow } from "./transaction-row";

describe("TransactionRow", () => {
  it("links to the transaction's detail", () => {
    render(<TransactionRow transaction={transactions.stripe} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/transactions?tx=${ids.txStripe}`,
    );
  });

  it("shows who, when, how and how much", () => {
    render(<TransactionRow transaction={transactions.stripe} />);

    const row = within(screen.getByRole("link"));
    expect(row.getByText("Stripe")).toBeInTheDocument();
    expect(row.getByText(/Jun 17/)).toBeInTheDocument();
    expect(row.getByText(/ACH/)).toBeInTheDocument();
    expect(row.getByText("+$11,048.20")).toHaveClass("text-positive");
  });

  it("shows money out with a minus sign, in the normal ink", () => {
    render(<TransactionRow transaction={transactions.aws} />);

    const amount = screen.getByText("-$15,137.39");
    expect(amount).not.toHaveClass("text-positive");
    expect(screen.getByText(/Card/)).toBeInTheDocument();
  });

  it("leaves out the status of a posted transaction", () => {
    render(<TransactionRow transaction={transactions.stripe} />);

    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
  });

  it.each([
    ["pending", transactions.aws, "Pending"],
    ["scheduled", transactions.scheduled, "Scheduled"],
    ["failed", transactions.failed, "Failed"],
  ] as const)("flags a %s transaction", (_status, transaction, label) => {
    render(<TransactionRow transaction={transaction} />);

    expect(
      within(screen.getByRole("link")).getByText(label),
    ).toBeInTheDocument();
  });

  it("names the link with its parts separated by commas, leaving out the decorative rules and icons", () => {
    render(<TransactionRow transaction={transactions.failed} />);

    // The visible separators are thin rules; a screen reader hears commas.
    expect(
      screen.getByRole("link", {
        name: /^Hartwell Staffing\s*May 26\s*,\s*ACH\s*,\s*Failed\s*-\$4,200\.00$/,
      }),
    ).toBeInTheDocument();
  });

  it("dates the row by the UTC day it posted", () => {
    render(
      <TransactionRow
        transaction={{
          ...transactions.stripe,
          postedAt: "2026-06-17T23:59:00.000Z",
        }}
      />,
    );

    expect(screen.getByText(/Jun 17/)).toBeInTheDocument();
  });
});
