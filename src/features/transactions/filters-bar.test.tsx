import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawFilters } from "@/lib/transaction-filters";
import { accounts, ids } from "../../../test/fixtures";
import { exportHref, FiltersBar } from "./filters-bar";

function setup(filters: RawFilters = {}) {
  const onChange = vi.fn();
  const onReplace = vi.fn();
  const view = render(
    <FiltersBar
      filters={filters}
      accounts={accounts}
      onChange={onChange}
      onReplace={onReplace}
    />,
  );
  /** Re-renders with new filters, as the view does when the URL changes. */
  const applyFilters = (next: RawFilters) =>
    view.rerender(
      <FiltersBar
        filters={next}
        accounts={accounts}
        onChange={onChange}
        onReplace={onReplace}
      />,
    );
  return { onChange, onReplace, applyFilters, user: userEvent.setup() };
}

const searchBox = () =>
  screen.getByRole("searchbox", { name: "Search transactions" });

afterEach(() => {
  vi.useRealTimers();
});

describe("exportHref", () => {
  it("points at the export endpoint when nothing is filtered", () => {
    expect(exportHref({})).toBe("/api/transactions/export");
  });

  it("carries the filters and the sort, but never the paging", () => {
    expect(
      exportHref({
        q: "aws",
        category: "cloud,software",
        sort: "amount",
        order: "asc",
        page: "3",
        pageSize: "50",
      }),
    ).toBe(
      "/api/transactions/export?q=aws&category=cloud%2Csoftware&sort=amount&order=asc",
    );
  });

  it("does not modify the filters it is given", () => {
    const filters: RawFilters = { q: "aws", page: "3", pageSize: "50" };

    exportHref(filters);

    expect(filters).toEqual({ q: "aws", page: "3", pageSize: "50" });
  });
});

describe("FiltersBar", () => {
  describe("search", () => {
    /**
     * These tests own the clock, so they type with `fireEvent`: user-event
     * waits on real timers between keystrokes and would never return.
     */
    function setupWithFakeTimers(filters: RawFilters = {}) {
      vi.useFakeTimers();
      const result = setup(filters);
      const type = (value: string) =>
        fireEvent.change(searchBox(), { target: { value } });
      const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
      return { ...result, type, wait };
    }

    it("starts from the search term in the URL without writing it back", () => {
      const { onChange, wait } = setupWithFakeTimers({ q: "stripe" });

      wait(1_000);

      expect(searchBox()).toHaveValue("stripe");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("shows typing immediately but applies it only after a 300ms pause", () => {
      const { onChange, type, wait } = setupWithFakeTimers();

      type("aws");
      expect(searchBox()).toHaveValue("aws");

      wait(299);
      expect(onChange).not.toHaveBeenCalled();

      wait(1);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: "aws" });
    });

    it("applies one search for a burst of typing, not one per keystroke", () => {
      const { onChange, type, wait } = setupWithFakeTimers();

      type("am");
      wait(200);
      type("amaz");
      wait(200);
      type("amazon");
      wait(299);
      expect(onChange).not.toHaveBeenCalled();

      wait(1);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: "amazon" });
    });

    it("trims the term before applying it", () => {
      const { onChange, type, wait } = setupWithFakeTimers();

      type("  gusto payroll  ");
      wait(300);

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: "gusto payroll" });
      expect(searchBox()).toHaveValue("  gusto payroll  ");
    });

    it("does not search for whitespace alone", () => {
      const { onChange, type, wait } = setupWithFakeTimers();

      type("   ");
      wait(1_000);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("removes the search when the box is emptied", () => {
      const { onChange, type, wait } = setupWithFakeTimers({ q: "stripe" });

      type("");
      wait(300);

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: "" });
    });

    it("does not re-apply a term once the URL has caught up with it", () => {
      const { onChange, applyFilters, type, wait } = setupWithFakeTimers();

      type("aws");
      wait(300);
      applyFilters({ q: "aws" });
      wait(1_000);

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("searches as a person types, with real keystrokes", async () => {
      const { onChange, user } = setup();

      await user.type(searchBox(), "aws");

      expect(searchBox()).toHaveValue("aws");
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledExactlyOnceWith({ q: "aws" }),
      );
    });
  });

  describe("account", () => {
    it("shows all accounts by default and lists each one", async () => {
      const { user } = setup();
      const select = screen.getByRole("combobox", { name: "Account" });

      expect(select).toHaveTextContent("All accounts");
      await user.click(select);

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual([
        "All accounts",
        "Operating Checking",
        "Savings Reserve",
        "Treasury",
      ]);
    });

    it("filters to the chosen account", async () => {
      const { onChange, user } = setup();

      await user.click(screen.getByRole("combobox", { name: "Account" }));
      await user.click(screen.getByRole("option", { name: "Savings Reserve" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        accountId: ids.savings,
      });
    });

    it("shows the filtered account and removes the filter with “All accounts”", async () => {
      const { onChange, user } = setup({ accountId: ids.treasury });
      const select = screen.getByRole("combobox", { name: "Account" });

      expect(select).toHaveTextContent("Treasury");
      await user.click(select);
      await user.click(screen.getByRole("option", { name: "All accounts" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        accountId: undefined,
      });
    });
  });

  describe("direction", () => {
    it("shows both directions by default", () => {
      setup();

      expect(
        screen.getByRole("combobox", { name: "Direction" }),
      ).toHaveTextContent("In and out");
    });

    it.each([
      ["Money in", "in"],
      ["Money out", "out"],
    ])("filters to “%s”", async (label, direction) => {
      const { onChange, user } = setup();

      await user.click(screen.getByRole("combobox", { name: "Direction" }));
      await user.click(screen.getByRole("option", { name: label }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ direction });
    });

    it("shows the filtered direction and removes the filter with “In and out”", async () => {
      const { onChange, user } = setup({ direction: "out" });
      const select = screen.getByRole("combobox", { name: "Direction" });

      expect(select).toHaveTextContent("Money out");
      await user.click(select);
      await user.click(screen.getByRole("option", { name: "In and out" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        direction: undefined,
      });
    });
  });

  describe("category", () => {
    it("offers every category by its display name", async () => {
      const { user } = setup();

      await user.click(screen.getByRole("button", { name: "Category" }));

      expect(
        screen.getAllByRole("checkbox").map((box) => box.getAttribute("id")),
      ).toHaveLength(13);
      expect(
        screen.getByRole("checkbox", { name: "Cloud & infrastructure" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Internal transfer" }),
      ).not.toBeChecked();
    });

    it("adds a category to the comma-separated list in the URL", async () => {
      const { onChange, user } = setup({ category: "cloud" });

      await user.click(screen.getByRole("button", { name: /^Category/ }));
      expect(
        screen.getByRole("checkbox", { name: "Cloud & infrastructure" }),
      ).toBeChecked();
      await user.click(screen.getByRole("checkbox", { name: "Payroll" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        category: "cloud,payroll",
      });
    });

    it("removes a category from the list", async () => {
      const { onChange, user } = setup({ category: "cloud,payroll" });

      await user.click(screen.getByRole("button", { name: /^Category/ }));
      await user.click(
        screen.getByRole("checkbox", { name: "Cloud & infrastructure" }),
      );

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ category: "payroll" });
    });

    it("sends an empty value, which removes the key, when cleared", async () => {
      const { onChange, user } = setup({ category: "cloud,payroll" });

      await user.click(screen.getByRole("button", { name: /^Category/ }));
      await user.click(screen.getByRole("button", { name: "Clear" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ category: "" });
    });
  });

  describe("status", () => {
    it("offers the four statuses and adds the ticked one", async () => {
      const { onChange, user } = setup({ status: "pending" });

      await user.click(screen.getByRole("button", { name: /^Status/ }));
      expect(
        screen.getAllByRole("listitem").map((item) => item.textContent),
      ).toEqual(["Posted", "Pending", "Scheduled", "Failed"]);
      expect(screen.getByRole("checkbox", { name: "Pending" })).toBeChecked();
      await user.click(screen.getByRole("checkbox", { name: "Failed" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        status: "pending,failed",
      });
    });

    it("sends an empty value when the last status is unticked", async () => {
      const { onChange, user } = setup({ status: "pending" });

      await user.click(screen.getByRole("button", { name: /^Status/ }));
      await user.click(screen.getByRole("checkbox", { name: "Pending" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({ status: "" });
    });
  });

  describe("date range", () => {
    it("shows the range from the URL", () => {
      setup({ from: "2026-06-01", to: "2026-06-30" });

      expect(
        screen.getByRole("button", { name: "Jun 1 – Jun 30" }),
      ).toBeVisible();
    });

    it("applies a preset as `from`, clearing any `to`", async () => {
      vi.useFakeTimers({
        toFake: ["Date"],
        now: new Date("2026-06-18T12:00:00.000Z"),
      });
      const { onChange, user } = setup({
        from: "2026-01-01",
        to: "2026-01-31",
      });

      await user.click(screen.getByRole("button", { name: "Jan 1 – Jan 31" }));
      await user.click(screen.getByRole("button", { name: "Last 30 days" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: "2026-05-20",
        to: undefined,
      });
    });

    it("clears both ends", async () => {
      const { onChange, user } = setup({ from: "2026-06-01" });

      await user.click(screen.getByRole("button", { name: "Since Jun 1" }));
      await user.click(screen.getByRole("button", { name: "Clear dates" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        from: undefined,
        to: undefined,
      });
    });
  });

  describe("amount", () => {
    it("shows the range from the URL, which is in cents", () => {
      setup({ minCents: "50000", maxCents: "100000" });

      expect(
        screen.getByRole("button", { name: "$500 – $1,000" }),
      ).toBeVisible();
    });

    it("writes an applied range to the URL as cent strings", async () => {
      const { onChange, user } = setup();

      await user.click(screen.getByRole("button", { name: "Any amount" }));
      await user.type(screen.getByLabelText("Minimum"), "500");
      await user.type(screen.getByLabelText("Maximum"), "1250.5");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        minCents: "50000",
        maxCents: "125050",
      });
    });

    it("keeps a zero minimum rather than treating it as empty", async () => {
      const { onChange, user } = setup();

      await user.click(screen.getByRole("button", { name: "Any amount" }));
      await user.type(screen.getByLabelText("Minimum"), "0");
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        minCents: "0",
        maxCents: undefined,
      });
    });

    it("removes both bounds when cleared", async () => {
      const { onChange, user } = setup({ minCents: "50000" });

      await user.click(screen.getByRole("button", { name: "At least $500" }));
      await user.click(screen.getByRole("button", { name: "Clear" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        minCents: undefined,
        maxCents: undefined,
      });
    });
  });

  describe("clear filters", () => {
    it("is hidden while nothing narrows the list", () => {
      setup({ sort: "amount", order: "asc", page: "2", pageSize: "50" });

      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument();
    });

    it("removes every narrowing filter and the page, keeping sort and page size", async () => {
      const { onReplace, onChange, user } = setup({
        q: "aws",
        accountId: ids.checking,
        category: "cloud",
        status: "pending",
        direction: "out",
        from: "2026-06-01",
        to: "2026-06-30",
        minCents: "1000",
        maxCents: "5000",
        sort: "amount",
        order: "asc",
        page: "3",
        pageSize: "50",
      });

      await user.click(screen.getByRole("button", { name: "Clear filters" }));

      expect(onReplace).toHaveBeenCalledExactlyOnceWith({
        sort: "amount",
        order: "asc",
        pageSize: "50",
      });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("empties the search box too", async () => {
      const { applyFilters, user } = setup({ q: "aws" });
      expect(searchBox()).toHaveValue("aws");

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      applyFilters({});

      expect(searchBox()).toHaveValue("");
      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("export", () => {
    it("links to a CSV download of the plain list", () => {
      setup();

      const link = screen.getByRole("link", { name: "Export CSV" });
      expect(link).toHaveAttribute("href", "/api/transactions/export");
      expect(link).toHaveAttribute("download");
    });

    it("exports the filtered, sorted view without page or page size", () => {
      setup({
        q: "aws",
        status: "pending,failed",
        direction: "out",
        sort: "amount",
        order: "asc",
        page: "3",
        pageSize: "50",
      });

      const href = screen
        .getByRole("link", { name: "Export CSV" })
        .getAttribute("href")!;
      const url = new URL(href, "http://localhost");

      expect(url.pathname).toBe("/api/transactions/export");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        q: "aws",
        status: "pending,failed",
        direction: "out",
        sort: "amount",
        order: "asc",
      });
    });
  });
});
