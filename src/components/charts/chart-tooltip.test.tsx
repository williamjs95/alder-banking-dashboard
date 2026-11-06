import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AXIS_TICK, ChartLegend, ChartTooltip } from "./chart-tooltip";

describe("ChartTooltip", () => {
  it("shows the title and one row per series, name then value", () => {
    render(
      <ChartTooltip
        title="June 2026"
        rows={[
          { name: "Money in", value: "$130,000", color: "var(--chart-1)" },
          { name: "Money out", value: "$160,000", color: "var(--chart-2)" },
        ]}
      />,
    );

    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual(["Money in$130,000", "Money out$160,000"]);
  });

  it("makes the value the strong element of each row", () => {
    render(
      <ChartTooltip title="June 2026" rows={[{ name: "Net", value: "$5" }]} />,
    );

    expect(screen.getByText("$5")).toHaveClass("font-semibold");
    expect(screen.getByText("Net")).toHaveClass("text-muted-foreground");
  });

  it("keys a row with a decorative stroke of its series color", () => {
    render(
      <ChartTooltip
        title="June 2026"
        rows={[{ name: "Money in", value: "$1", color: "rgb(1, 2, 3)" }]}
      />,
    );

    const swatch = screen.getByRole("listitem").firstElementChild;
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(swatch).toHaveStyle({ backgroundColor: "rgb(1, 2, 3)" });
  });

  it("leaves out the stroke for a row with no color", () => {
    render(
      <ChartTooltip
        title="June 2026"
        rows={[{ name: "Balance", value: "$1" }]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(row.querySelector("[aria-hidden]")).toBeNull();
    expect(within(row).getByText("Balance")).toBe(row.firstElementChild);
  });

  it("adds a footer when given one", () => {
    render(
      <ChartTooltip
        title="June 2026"
        rows={[]}
        footer={<span>Net -$30,000</span>}
      />,
    );

    expect(screen.getByText("Net -$30,000")).toBeInTheDocument();
  });

  it("has no footer otherwise", () => {
    const { container } = render(
      <ChartTooltip title="June 2026" rows={[{ name: "A", value: "1" }]} />,
    );

    expect(container).toHaveTextContent(/^June 2026A1$/);
  });
});

describe("ChartLegend", () => {
  it("lists every series by name, in order", () => {
    render(
      <ChartLegend
        items={[
          { name: "Payroll", color: "var(--chart-1)" },
          { name: "Taxes", color: "var(--chart-2)" },
          { name: "Other", color: "var(--chart-other)" },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Payroll", "Taxes", "Other"]);
  });

  it("gives each name a decorative swatch in its series color", () => {
    render(
      <ChartLegend items={[{ name: "Payroll", color: "rgb(9, 8, 7)" }]} />,
    );

    const swatch = screen.getByRole("listitem").firstElementChild;
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(swatch).toHaveStyle({ backgroundColor: "rgb(9, 8, 7)" });
  });

  it("renders an empty list for no series", () => {
    render(<ChartLegend items={[]} />);

    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });
});

describe("AXIS_TICK", () => {
  it("styles axis text from the theme, at a readable size", () => {
    expect(AXIS_TICK).toEqual({
      fill: "var(--subtle-foreground)",
      fontSize: 12,
    });
  });
});
