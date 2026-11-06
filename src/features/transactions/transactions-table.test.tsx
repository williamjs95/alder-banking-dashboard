import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SortField, TransactionDto } from "@/lib/contracts";
import { ids, transactionList, transactions } from "../../../test/fixtures";
import { TransactionsTable } from "./transactions-table";

type Sort = { sort: SortField; order: "asc" | "desc" };

function setup({
  rows = transactionList.items,
  sort = { sort: "date", order: "desc" },
  dimmed = false,
}: {
  rows?: readonly TransactionDto[];
  sort?: Sort;
  dimmed?: boolean;
} = {}) {
  const onSort = vi.fn();
  const onOpen = vi.fn();
  const { container } = render(
    <TransactionsTable
      transactions={rows}
      sort={sort}
      onSort={onSort}
      onOpen={onOpen}
      dimmed={dimmed}
    />,
  );
  return { container, onSort, onOpen, user: userEvent.setup() };
}

// CSS breakpoints do not apply in jsdom, so the desktop table and the mobile
// list are both in the document. Each test scopes itself to one of them.
const table = () => within(screen.getByRole("table"));
const mobileList = () => within(screen.getByRole("list"));

/** The table row for a transaction, found by its description. */
const rowFor = (description: string) =>
  within(table().getByRole("button", { name: description }).closest("tr")!);

describe("TransactionsTable", () => {
  describe("table", () => {
    it("has a column for each field, in reading order", () => {
      setup();

      expect(
        table()
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual([
        "Date",
        "Description",
        "Category",
        "Account",
        "Status",
        "Amount",
      ]);
    });

    it("renders one row per transaction, in the order given", () => {
      setup();

      const descriptions = table()
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getByRole("button").textContent);

      expect(descriptions).toEqual([
        "Gusto Payroll",
        "Stripe",
        "Transfer to Operating Checking",
        "Amazon Web Services",
        "Hartwell Staffing",
      ]);
    });

    it("shows date, description, category, account, status and signed amount", () => {
      setup();

      const stripe = rowFor("Stripe")
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
      expect(stripe).toEqual([
        "Jun 17, 2026",
        "Stripe",
        "Revenue",
        "Operating Checking",
        "Posted",
        "+$11,048.20",
      ]);

      const aws = rowFor("Amazon Web Services")
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
      expect(aws).toEqual([
        "Jun 3, 2026",
        "Amazon Web Services",
        "Cloud & infrastructure",
        "Operating Checking",
        "Pending",
        "-$15,137.39",
      ]);
    });

    it("flags transactions that have a note, and only those", () => {
      setup();

      expect(
        rowFor("Amazon Web Services").getByLabelText("Has a note"),
      ).toBeVisible();
      expect(
        rowFor("Hartwell Staffing").getByLabelText("Has a note"),
      ).toBeVisible();
      expect(
        rowFor("Stripe").queryByLabelText("Has a note"),
      ).not.toBeInTheDocument();
    });

    it("strikes through the amount of a failed transaction, and only that one", () => {
      setup();

      expect(rowFor("Hartwell Staffing").getByText("-$4,200.00")).toHaveClass(
        "line-through",
      );
      expect(
        rowFor("Amazon Web Services").getByText("-$15,137.39"),
      ).not.toHaveClass("line-through");
      expect(rowFor("Stripe").getByText("+$11,048.20")).not.toHaveClass(
        "line-through",
      );
    });

    it("opens a transaction when its row is clicked", async () => {
      const { onOpen, user } = setup();

      await user.click(rowFor("Stripe").getByText("Jun 17, 2026"));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith(ids.txStripe);
    });

    it("opens a transaction once when its description button is clicked", async () => {
      const { onOpen, user } = setup();

      await user.click(
        table().getByRole("button", { name: "Amazon Web Services" }),
      );

      // Once: the button's click must not also bubble to the row.
      expect(onOpen).toHaveBeenCalledExactlyOnceWith(ids.txAws);
    });

    it("opens a transaction from the keyboard", async () => {
      const { onOpen, user } = setup();

      table().getByRole("button", { name: "Gusto Payroll" }).focus();
      await user.keyboard("{Enter}");

      expect(onOpen).toHaveBeenCalledExactlyOnceWith(ids.txScheduled);
    });

    it("renders only the header when there are no transactions", () => {
      setup({ rows: [] });

      expect(table().getAllByRole("row")).toHaveLength(1);
      expect(mobileList().queryAllByRole("listitem")).toHaveLength(0);
    });
  });

  describe("sorting", () => {
    const sortOf = (name: string) =>
      table().getByRole("columnheader", { name }).getAttribute("aria-sort");

    it("marks the default sort, newest first, on the Date column", () => {
      setup();

      expect(sortOf("Date")).toBe("descending");
      expect(sortOf("Description")).toBe("none");
      expect(sortOf("Amount")).toBe("none");
    });

    it("marks an ascending sort on the active column only", () => {
      setup({ sort: { sort: "amount", order: "asc" } });

      expect(sortOf("Amount")).toBe("ascending");
      expect(sortOf("Date")).toBe("none");
      expect(sortOf("Description")).toBe("none");
    });

    it("marks a descending sort on the Description column", () => {
      setup({ sort: { sort: "description", order: "desc" } });

      expect(sortOf("Description")).toBe("descending");
      expect(sortOf("Date")).toBe("none");
    });

    it("does not make Category, Account or Status sortable", () => {
      setup();

      for (const name of ["Category", "Account", "Status"]) {
        const header = table().getByRole("columnheader", { name });
        expect(header).not.toHaveAttribute("aria-sort");
        expect(within(header).queryByRole("button")).not.toBeInTheDocument();
      }
    });

    it.each<[string, SortField]>([
      ["Date", "date"],
      ["Description", "description"],
      ["Amount", "amount"],
    ])("asks to sort by %s when its header is clicked", async (name, field) => {
      const { onSort, onOpen, user } = setup();

      await user.click(
        within(table().getByRole("columnheader", { name })).getByRole("button"),
      );

      expect(onSort).toHaveBeenCalledExactlyOnceWith(field);
      expect(onOpen).not.toHaveBeenCalled();
    });
  });

  describe("mobile list", () => {
    it("renders one item per transaction with description, date, method and amount", () => {
      setup();

      const items = mobileList().getAllByRole("listitem");
      expect(items).toHaveLength(5);
      expect(items[1]).toHaveTextContent("Stripe");
      expect(items[1]).toHaveTextContent("Jun 17, 2026, ACH");
      expect(items[1]).toHaveTextContent("+$11,048.20");
      expect(items[2]).toHaveTextContent("Transfer to Operating Checking");
      expect(items[2]).toHaveTextContent("Jun 5, 2026, Transfer");
      expect(items[2]).toHaveTextContent("-$60,000.00");
    });

    it("shows the status only when a transaction is not simply posted", () => {
      setup({
        rows: [
          transactions.stripe,
          transactions.aws,
          transactions.scheduled,
          transactions.failed,
        ],
      });

      const [posted, pending, scheduled, failed] =
        mobileList().getAllByRole("listitem");
      expect(within(posted).queryByText("Posted")).not.toBeInTheDocument();
      expect(within(pending).getByText("Pending")).toBeVisible();
      expect(within(scheduled).getByText("Scheduled")).toBeVisible();
      expect(within(failed).getByText("Failed")).toBeVisible();
    });

    it("opens a transaction when its item is tapped", async () => {
      const { onOpen, user } = setup();

      await user.click(
        mobileList().getByRole("button", { name: /Hartwell Staffing/ }),
      );

      expect(onOpen).toHaveBeenCalledExactlyOnceWith(ids.txFailed);
    });
  });

  describe("while the next page or filter loads", () => {
    it("keeps the rows on screen and marks the ledger busy", () => {
      const { container } = setup({ dimmed: true });

      expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
      expect(container.firstElementChild).toHaveClass("opacity-60");
      expect(table().getAllByRole("row")).toHaveLength(6);
    });

    it("is not busy once the data is current", () => {
      const { container } = setup();

      expect(container.firstElementChild).toHaveAttribute("aria-busy", "false");
      expect(container.firstElementChild).not.toHaveClass("opacity-60");
    });
  });
});
