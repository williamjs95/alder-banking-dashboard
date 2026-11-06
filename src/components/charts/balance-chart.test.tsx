import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { balanceSeries } from "../../../test/fixtures";
import { stubLayout } from "../../../test/ui-layout";
import {
  BALANCE_RANGES,
  BalanceChart,
  balanceTable,
  BalanceTooltip,
  sliceRange,
} from "./balance-chart";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BALANCE_RANGES", () => {
  it("offers 30 days, 90 days and a year", () => {
    expect(BALANCE_RANGES).toEqual([
      { value: "30", label: "30D" },
      { value: "90", label: "90D" },
      { value: "365", label: "1Y" },
    ]);
  });
});

describe("sliceRange", () => {
  const year = balanceSeries(365);

  it.each([
    ["30", 30, "2026-05-20"],
    ["90", 90, "2026-03-21"],
    ["365", 365, "2025-06-19"],
  ] as const)("keeps the trailing %s days", (range, length, firstDate) => {
    const slice = sliceRange(year, range);

    expect(slice).toHaveLength(length);
    expect(slice[0].date).toBe(firstDate);
    expect(slice.at(-1)).toEqual({
      date: "2026-06-18",
      balanceCents: 1_750_000_00,
    });
  });

  it("returns everything when the series is shorter than the range", () => {
    const week = balanceSeries(7);

    expect(sliceRange(week, "30")).toEqual(week);
  });

  it("returns a copy, leaving the series untouched", () => {
    const slice = sliceRange(year, "365");

    expect(slice).not.toBe(year);
    expect(year).toHaveLength(365);
  });

  it("is empty for an empty series", () => {
    expect(sliceRange([], "90")).toEqual([]);
  });
});

describe("BalanceTooltip", () => {
  const point = { date: "2026-06-18", balanceCents: 1_750_000_00 };

  it("shows the day, with its year, and the balance to the cent", () => {
    render(<BalanceTooltip active payload={[{ payload: point }]} />);

    expect(screen.getByText("Jun 18, 2026")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Balance$1,750,000.00",
    );
  });

  it("shows a negative balance with a minus sign", () => {
    render(
      <BalanceTooltip
        active
        payload={[{ payload: { date: "2026-01-02", balanceCents: -42_10 } }]}
      />,
    );

    expect(screen.getByText("Jan 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("-$42.10")).toBeInTheDocument();
  });

  it.each([
    [
      "the chart is not being inspected",
      { active: false, payload: [{ payload: point }] },
    ],
    ["active is not set", { payload: [{ payload: point }] }],
    ["there is no payload", { active: true }],
    ["the payload is empty", { active: true, payload: [] }],
    ["the payload entry carries no point", { active: true, payload: [{}] }],
  ])("renders nothing when %s", (_case, props) => {
    const { container } = render(<BalanceTooltip {...props} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("balanceTable", () => {
  it("lists each day with its balance, newest first", () => {
    expect(balanceTable(balanceSeries(3))).toEqual({
      columns: ["Date", "Balance"],
      rows: [
        ["Jun 18, 2026", "$1,750,000.00"],
        ["Jun 17, 2026", "$1,749,000.00"],
        ["Jun 16, 2026", "$1,748,000.00"],
      ],
    });
  });

  it("does not reorder the series it was given", () => {
    const series = balanceSeries(3);

    balanceTable(series);

    expect(series.map((point) => point.date)).toEqual([
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
    ]);
  });

  it("has headings but no rows for an empty series", () => {
    expect(balanceTable([])).toEqual({
      columns: ["Date", "Balance"],
      rows: [],
    });
  });
});

describe("BalanceChart", () => {
  // The plot area runs from x=56 (after the y-axis) to x=632 (before the margin).
  const PLOT_LEFT = 56;
  const PLOT_RIGHT = 632;

  function setup(count = 30) {
    stubLayout({ width: 640, height: 240 });
    const user = userEvent.setup();
    const view = render(<BalanceChart data={balanceSeries(count)} />);
    const chart = screen.getByRole("application");
    const hover = (clientX: number) =>
      user.pointer({ target: chart, coords: { clientX, clientY: 120 } });
    return { ...view, user, chart, hover };
  }

  it("draws the series as a single line at the measured size", () => {
    const { chart, container } = setup();

    expect(chart).toHaveAttribute("width", "640");
    expect(chart).toHaveAttribute("height", "240");
    const lines = container.querySelectorAll("path.recharts-area-curve");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute("stroke", "var(--chart-1)");
  });

  it("draws a steadily rising balance as a line that climbs left to right", () => {
    const { container } = setup();

    const d = container
      .querySelector("path.recharts-area-curve")
      ?.getAttribute("d");
    const [startX, startY] = d!
      .match(/^M([\d.]+),([\d.]+)/)!
      .slice(1)
      .map(Number);
    const [endX, endY] = d!
      .match(/([\d.]+),([\d.]+)$/)!
      .slice(1)
      .map(Number);

    expect(startX).toBe(PLOT_LEFT);
    expect(endX).toBe(PLOT_RIGHT);
    // SVG y grows downward, so a higher balance has a smaller y.
    expect(endY).toBeLessThan(startY);
  });

  it("shows nothing in the tooltip until a point is inspected", () => {
    setup();

    expect(screen.queryByText("Balance")).not.toBeInTheDocument();
  });

  it("shows the latest day's balance when hovering the right edge", async () => {
    const { hover } = setup();

    await hover(PLOT_RIGHT);

    expect(await screen.findByText("Jun 18, 2026")).toBeInTheDocument();
    expect(screen.getByText("$1,750,000.00")).toBeInTheDocument();
  });

  it("shows the earliest day's balance when hovering the left edge", async () => {
    const { hover } = setup();

    await hover(PLOT_LEFT);

    expect(await screen.findByText("May 20, 2026")).toBeInTheDocument();
    expect(screen.getByText("$1,721,000.00")).toBeInTheDocument();
  });

  it("follows the pointer from one day to another", async () => {
    const { hover } = setup();

    await hover(PLOT_LEFT);
    await screen.findByText("May 20, 2026");
    await hover(PLOT_RIGHT);

    expect(await screen.findByText("Jun 18, 2026")).toBeInTheDocument();
    expect(screen.queryByText("May 20, 2026")).not.toBeInTheDocument();
  });

  it("clears the tooltip when the pointer leaves the chart", async () => {
    const { hover, user } = setup();
    await hover(PLOT_RIGHT);
    await screen.findByText("Jun 18, 2026");

    await user.pointer({ target: document.body });

    await vi.waitFor(() =>
      expect(screen.queryByText("Jun 18, 2026")).not.toBeInTheDocument(),
    );
  });

  it("can be read point by point from the keyboard", async () => {
    const { user, chart } = setup();

    await user.tab();
    expect(chart).toHaveFocus();
    expect(await screen.findByText("May 20, 2026")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("May 21, 2026")).toBeInTheDocument();
    expect(screen.getByText("$1,722,000.00")).toBeInTheDocument();
  });

  it("draws no line for an empty series", () => {
    const { container } = setup(0);

    expect(container.querySelectorAll("path.recharts-area-curve")).toHaveLength(
      0,
    );
  });
});
