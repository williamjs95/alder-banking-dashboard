import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { overview } from "../../../test/fixtures";
import { stubLayout } from "../../../test/ui-layout";
import {
  CashflowChart,
  cashflowTable,
  CashflowTooltip,
} from "./cashflow-chart";

afterEach(() => {
  vi.restoreAllMocks();
});

const june = overview.cashflow[2];

describe("CashflowTooltip", () => {
  it("shows the month, both flows in whole dollars, and the signed net", () => {
    render(<CashflowTooltip active payload={[{ payload: june }]} />);

    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual(["Money in$130,000", "Money out$160,000"]);
    expect(screen.getByText("Net").parentElement).toHaveTextContent(
      "Net-$30,000",
    );
  });

  it("marks a month that took in more than it spent with a plus", () => {
    render(
      <CashflowTooltip
        active
        payload={[
          {
            payload: {
              month: "2026-01",
              inflowCents: 90_000_49,
              outflowCents: 40_000_00,
              netCents: 50_000_49,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("January 2026")).toBeInTheDocument();
    expect(screen.getByText("$90,000")).toBeInTheDocument();
    expect(screen.getByText("+$50,000")).toBeInTheDocument();
  });

  it.each([
    [
      "the chart is not being inspected",
      { active: false, payload: [{ payload: june }] },
    ],
    ["active is not set", { payload: [{ payload: june }] }],
    ["there is no payload", { active: true }],
    ["the payload is empty", { active: true, payload: [] }],
    ["the payload entry carries no month", { active: true, payload: [{}] }],
  ])("renders nothing when %s", (_case, props) => {
    const { container } = render(<CashflowTooltip {...props} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("cashflowTable", () => {
  it("lists each month to the cent, newest first, with a signed net", () => {
    expect(cashflowTable(overview.cashflow)).toEqual({
      columns: ["Month", "Money in", "Money out", "Net"],
      rows: [
        ["June 2026", "$130,000.00", "$160,000.00", "-$30,000.00"],
        ["May 2026", "$210,000.00", "$265,000.00", "-$55,000.00"],
        ["April 2026", "$200,000.00", "$260,000.00", "-$60,000.00"],
      ],
    });
  });

  it("marks a positive net with a plus and leaves a zero net unsigned", () => {
    const { rows } = cashflowTable([
      { month: "2026-01", inflowCents: 500, outflowCents: 200, netCents: 300 },
      { month: "2026-02", inflowCents: 200, outflowCents: 200, netCents: 0 },
    ]);

    expect(rows).toEqual([
      ["February 2026", "$2.00", "$2.00", "$0.00"],
      ["January 2026", "$5.00", "$2.00", "+$3.00"],
    ]);
  });

  it("does not reorder the months it was given", () => {
    const months = [...overview.cashflow];

    cashflowTable(months);

    expect(months).toEqual(overview.cashflow);
  });

  it("has headings but no rows when there are no months", () => {
    expect(cashflowTable([]).rows).toEqual([]);
  });
});

describe("CashflowChart", () => {
  function setup(data = overview.cashflow) {
    stubLayout({ width: 640, height: 240 });
    const user = userEvent.setup();
    const view = render(<CashflowChart data={data} />);
    const chart = screen.getByRole("application");
    const hover = (clientX: number) =>
      user.pointer({ target: chart, coords: { clientX, clientY: 120 } });
    /** Bar heights for one series, in month order. */
    const heights = (series: string) =>
      [...view.container.querySelectorAll(`path[name="${series}"]`)].map(
        (bar) => Number(bar.getAttribute("height")),
      );
    return { ...view, user, chart, hover, heights };
  }

  it("names both series in a legend", () => {
    setup();

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Money in", "Money out"]);
  });

  it("draws one bar per series for every month", () => {
    const { heights } = setup();

    expect(heights("Money in")).toHaveLength(3);
    expect(heights("Money out")).toHaveLength(3);
  });

  it("draws both series to the same zero-based scale", () => {
    const { heights } = setup();
    const [aprilIn, mayIn, juneIn] = heights("Money in");
    const [aprilOut, mayOut, juneOut] = heights("Money out");

    // $200K in against $260K out in April, and so on down the fixture.
    expect(aprilIn / aprilOut).toBeCloseTo(200 / 260, 3);
    expect(mayIn / mayOut).toBeCloseTo(210 / 265, 3);
    expect(juneIn / juneOut).toBeCloseTo(130 / 160, 3);
    expect(juneIn / aprilIn).toBeCloseTo(130 / 200, 3);
  });

  it("colors the series to match the legend", () => {
    const { container } = setup();

    expect(container.querySelector('path[name="Money in"]')).toHaveAttribute(
      "fill",
      "var(--chart-1)",
    );
    expect(container.querySelector('path[name="Money out"]')).toHaveAttribute(
      "fill",
      "var(--chart-2)",
    );
    const [inSwatch, outSwatch] = screen
      .getAllByRole("listitem")
      .map((item) => item.firstElementChild);
    expect(inSwatch).toHaveAttribute(
      "style",
      expect.stringContaining("background-color: var(--chart-1)"),
    );
    expect(outSwatch).toHaveAttribute(
      "style",
      expect.stringContaining("background-color: var(--chart-2)"),
    );
  });

  it("shows a month's totals when hovering its bars", async () => {
    // Three months share the 576px plot area: April, May and June in turn.
    const { hover } = setup();

    await hover(150);
    expect(await screen.findByText("April 2026")).toBeInTheDocument();
    expect(screen.getByText("$200,000")).toBeInTheDocument();
    expect(screen.getByText("$260,000")).toBeInTheDocument();
    expect(screen.getByText("-$60,000")).toBeInTheDocument();

    await hover(540);
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("-$30,000")).toBeInTheDocument();
    expect(screen.queryByText("April 2026")).not.toBeInTheDocument();
  });

  it("can be read month by month from the keyboard", async () => {
    const { user, chart } = setup();

    await user.tab();
    expect(chart).toHaveFocus();
    expect(await screen.findByText("April 2026")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("-$55,000")).toBeInTheDocument();
  });

  it("keeps the legend and draws no bars when there is no data", () => {
    const { container } = setup([]);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelectorAll("path[name]")).toHaveLength(0);
  });
});
