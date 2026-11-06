import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { ChartCard, type ChartTable } from "./chart-card";

const TABLE: ChartTable = {
  columns: ["Month", "Money in", "Money out"],
  rows: [
    ["June 2026", "$130,000.00", "$160,000.00"],
    ["May 2026", "$210,000.00", "$265,000.00"],
  ],
};

function setup(props: Partial<Parameters<typeof ChartCard>[0]> = {}) {
  const user = userEvent.setup();
  renderWithProviders(
    <ChartCard title="Cash flow" table={TABLE} {...props}>
      <svg role="img" aria-label="Cash flow chart" />
    </ChartCard>,
  );
  return { user };
}

describe("ChartCard", () => {
  it("titles the card with a second-level heading", () => {
    setup();

    expect(
      screen.getByRole("heading", { level: 2, name: "Cash flow" }),
    ).toBeInTheDocument();
  });

  it("shows the chart first, with a switch to the table that is not pressed", () => {
    setup();

    expect(
      screen.getByRole("img", { name: "Cash flow chart" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show as table" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a description and controls when given them", () => {
    setup({
      description: <span>Last 3 months</span>,
      actions: <button>90D</button>,
    });

    expect(screen.getByText("Last 3 months")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
  });

  it("has no description otherwise", () => {
    setup();

    const heading = screen.getByRole("heading", { name: "Cash flow" });
    expect(heading.parentElement).toHaveTextContent(/^Cash flow$/);
  });

  it("swaps the chart for a table of the same numbers", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Show as table" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Cash flow" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toEqual(["Month", "Money in", "Money out"]);
    const [, ...bodyRows] = within(table).getAllByRole("row");
    expect(
      bodyRows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ["June 2026", "$130,000.00", "$160,000.00"],
      ["May 2026", "$210,000.00", "$265,000.00"],
    ]);
  });

  it("right-aligns the numeric columns and leaves the row label on the left", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Show as table" }));

    const [label, moneyIn] = screen.getAllByRole("columnheader");
    expect(label).not.toHaveClass("text-right");
    expect(moneyIn).toHaveClass("text-right");
    expect(screen.getByRole("cell", { name: "June 2026" })).not.toHaveClass(
      "text-right",
    );
    expect(screen.getByRole("cell", { name: "$130,000.00" })).toHaveClass(
      "tabular",
      "text-right",
    );
  });

  it("relabels the switch as pressed while the table is showing", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Show as table" }));

    expect(screen.getByRole("button", { name: "Show chart" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Show as table" }),
    ).not.toBeInTheDocument();
  });

  it("switches back to the chart", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Show as table" }));
    await user.click(screen.getByRole("button", { name: "Show chart" }));

    expect(
      screen.getByRole("img", { name: "Cash flow chart" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show as table" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the controls in place while the table is showing", async () => {
    const { user } = setup({ actions: <button>90D</button> });

    await user.click(screen.getByRole("button", { name: "Show as table" }));

    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
  });

  it("can be toggled from the keyboard, with a tooltip naming the switch", async () => {
    const { user } = setup();

    await user.tab();
    expect(screen.getByRole("button", { name: "Show as table" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Show as table",
    );

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("table", { name: "Cash flow" }),
    ).toBeInTheDocument();
  });

  it("shows only the headings for a table with no rows", async () => {
    const { user } = setup({
      table: { columns: ["Date", "Balance"], rows: [] },
    });

    await user.click(screen.getByRole("button", { name: "Show as table" }));

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.queryByRole("cell")).not.toBeInTheDocument();
  });

  it("accepts extra classes", () => {
    setup({ className: "lg:col-span-2" });

    const card = screen
      .getByRole("heading", { name: "Cash flow" })
      .closest(".lg\\:col-span-2");
    expect(card).toContainElement(screen.getByRole("img"));
  });
});
