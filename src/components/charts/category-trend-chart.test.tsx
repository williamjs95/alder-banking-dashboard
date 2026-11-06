import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { insights } from "../../../test/fixtures";
import { stubLayout } from "../../../test/ui-layout";
import type { CategoryTrendMonth } from "@/lib/contracts";
import type { Category } from "@/lib/domain";
import {
  buildTrend,
  CategoryTrendChart,
  MAX_TREND_SERIES,
  trendTable,
  TrendTooltip,
  type TrendRow,
  type TrendSeries,
} from "./category-trend-chart";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildTrend", () => {
  it("gives at most five categories a color of their own", () => {
    expect(MAX_TREND_SERIES).toBe(5);
  });

  describe("with more than five categories", () => {
    // Seven categories: payroll, taxes, cloud, marketing, insurance, then
    // software and rent, which fold into "Other".
    const { series, rows } = buildTrend(
      insights.categoryTrend,
      insights.trendCategories,
    );

    it("keeps the five largest, in order, and adds Other last", () => {
      expect(series).toEqual([
        { key: "payroll", name: "Payroll", color: "var(--chart-1)" },
        { key: "taxes", name: "Taxes", color: "var(--chart-2)" },
        {
          key: "cloud",
          name: "Cloud & infrastructure",
          color: "var(--chart-3)",
        },
        { key: "marketing", name: "Marketing", color: "var(--chart-4)" },
        {
          key: "insurance",
          name: "Insurance & benefits",
          color: "var(--chart-5)",
        },
        { key: "rest", name: "Other", color: "var(--chart-other)" },
      ]);
    });

    it("sums the remaining categories into Other for each month", () => {
      expect(rows).toEqual([
        {
          month: "2026-05",
          payroll: 150_000_00,
          taxes: 42_000_00,
          cloud: 16_000_00,
          marketing: 14_000_00,
          insurance: 12_000_00,
          rest: 8_000_00 + 8_400_00,
          total: 250_400_00,
        },
        {
          month: "2026-06",
          payroll: 76_000_00,
          taxes: 21_000_00,
          cloud: 15_000_00,
          marketing: 9_000_00,
          insurance: 11_000_00,
          // No rent in June: a missing category counts as zero.
          rest: 6_000_00,
          total: 138_000_00,
        },
      ]);
    });

    it("totals every category, so folding into Other loses nothing", () => {
      for (const [index, { totals }] of insights.categoryTrend.entries()) {
        const sum = Object.values(totals).reduce((a, b) => a + b, 0);
        expect(rows[index].total).toBe(sum);
      }
    });
  });

  describe("with exactly five categories", () => {
    const categories: Category[] = [
      "payroll",
      "taxes",
      "cloud",
      "marketing",
      "insurance",
    ];
    const { series, rows } = buildTrend(insights.categoryTrend, categories);

    it("shows all five and no Other", () => {
      expect(series.map((item) => item.name)).toEqual([
        "Payroll",
        "Taxes",
        "Cloud & infrastructure",
        "Marketing",
        "Insurance & benefits",
      ]);
      expect(rows[0]).not.toHaveProperty("rest");
    });

    it("totals only the categories it was asked to chart", () => {
      expect(rows.map((row) => row.total)).toEqual([234_000_00, 132_000_00]);
    });
  });

  describe("with fewer than five categories", () => {
    const { series, rows } = buildTrend(insights.categoryTrend, [
      "taxes",
      "rent",
    ]);

    it("uses the first color slots, in the order given", () => {
      expect(series).toEqual([
        { key: "taxes", name: "Taxes", color: "var(--chart-1)" },
        { key: "rent", name: "Rent & office", color: "var(--chart-2)" },
      ]);
    });

    it("fills a month with no spend in a category with zero", () => {
      expect(rows).toEqual([
        {
          month: "2026-05",
          taxes: 42_000_00,
          rent: 8_400_00,
          total: 50_400_00,
        },
        { month: "2026-06", taxes: 21_000_00, rent: 0, total: 21_000_00 },
      ]);
    });
  });

  it("is empty when there is nothing to chart", () => {
    expect(buildTrend([], [])).toEqual({ series: [], rows: [] });
  });

  it("keeps a row per month even when no categories are charted", () => {
    expect(buildTrend(insights.categoryTrend, []).rows).toEqual([
      { month: "2026-05", total: 0 },
      { month: "2026-06", total: 0 },
    ]);
  });

  it("counts a month missing every folded category as zero in Other", () => {
    const months: CategoryTrendMonth[] = [
      { month: "2026-01", totals: { payroll: 100 } },
    ];
    const { rows } = buildTrend(months, insights.trendCategories);

    expect(rows[0]).toMatchObject({
      payroll: 100,
      taxes: 0,
      rest: 0,
      total: 100,
    });
  });
});

const SERIES: TrendSeries[] = [
  { key: "payroll", name: "Payroll", color: "var(--chart-1)" },
  { key: "taxes", name: "Taxes", color: "var(--chart-2)" },
  { key: "rest", name: "Other", color: "var(--chart-other)" },
];
const ROWS: TrendRow[] = [
  {
    month: "2026-05",
    payroll: 150_000_00,
    taxes: 42_000_00,
    rest: 16_400_49,
    total: 208_400_49,
  },
  {
    month: "2026-06",
    payroll: 76_000_00,
    taxes: 21_000_00,
    rest: 0,
    total: 97_000_00,
  },
];

describe("TrendTooltip", () => {
  it("lists the series top-down, as the segments are stacked, with a total", () => {
    render(
      <TrendTooltip active payload={[{ payload: ROWS[0] }]} series={SERIES} />,
    );

    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").map((row) => row.textContent),
    ).toEqual(["Other$16,400", "Taxes$42,000", "Payroll$150,000"]);
    expect(screen.getByText("Total").parentElement).toHaveTextContent(
      "Total$208,400",
    );
  });

  it("does not reorder the series it was given", () => {
    const series = [...SERIES];

    render(
      <TrendTooltip active payload={[{ payload: ROWS[0] }]} series={series} />,
    );

    expect(series).toEqual(SERIES);
  });

  it.each([
    [
      "the chart is not being inspected",
      { active: false, payload: [{ payload: ROWS[0] }] },
    ],
    ["active is not set", { payload: [{ payload: ROWS[0] }] }],
    ["there is no payload", { active: true }],
    ["the payload is empty", { active: true, payload: [] }],
    ["the payload entry carries no row", { active: true, payload: [{}] }],
  ])("renders nothing when %s", (_case, props) => {
    const { container } = render(<TrendTooltip {...props} series={SERIES} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("trendTable", () => {
  it("has a column per series between the month and the total, newest month first", () => {
    expect(trendTable(SERIES, ROWS)).toEqual({
      columns: ["Month", "Payroll", "Taxes", "Other", "Total"],
      rows: [
        ["June 2026", "$76,000.00", "$21,000.00", "$0.00", "$97,000.00"],
        ["May 2026", "$150,000.00", "$42,000.00", "$16,400.49", "$208,400.49"],
      ],
    });
  });

  it("does not reorder the rows it was given", () => {
    const rows = [...ROWS];

    trendTable(SERIES, rows);

    expect(rows).toEqual(ROWS);
  });

  it("has only the month and total columns when there are no series", () => {
    expect(trendTable([], [{ month: "2026-06", total: 0 }])).toEqual({
      columns: ["Month", "Total"],
      rows: [["June 2026", "$0.00"]],
    });
  });
});

describe("CategoryTrendChart", () => {
  function setup(series = SERIES, rows = ROWS) {
    stubLayout({ width: 640, height: 280 });
    const user = userEvent.setup();
    const view = render(<CategoryTrendChart series={series} rows={rows} />);
    const chart = screen.getByRole("application");
    const hover = (clientX: number) =>
      user.pointer({ target: chart, coords: { clientX, clientY: 140 } });
    /** One series' segments, in month order. */
    const segments = (name: string) => [
      ...view.container.querySelectorAll(`path[name="${name}"]`),
    ];
    return { ...view, user, chart, hover, segments };
  }

  it("names every series in a legend, in stacking order", () => {
    setup();

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Payroll", "Taxes", "Other"]);
  });

  it("draws a segment per series for each month, in the series color", () => {
    const { segments } = setup();

    expect(segments("Payroll")).toHaveLength(2);
    expect(segments("Taxes")).toHaveLength(2);
    expect(segments("Payroll")[0]).toHaveAttribute("fill", "var(--chart-1)");
    expect(segments("Taxes")[0]).toHaveAttribute("fill", "var(--chart-2)");
  });

  it("sizes segments in proportion to spend and stacks them without gaps", () => {
    const { segments } = setup();
    const box = (segment: Element) => ({
      y: Number(segment.getAttribute("y")),
      height: Number(segment.getAttribute("height")),
    });
    const payroll = box(segments("Payroll")[0]);
    const taxes = box(segments("Taxes")[0]);

    expect(taxes.height / payroll.height).toBeCloseTo(42_000 / 150_000, 3);
    // Taxes sits directly on top of payroll.
    expect(taxes.y + taxes.height).toBeCloseTo(payroll.y, 3);
  });

  it("shows a month's breakdown and total when hovering its bar", async () => {
    // Two months share the 576px plot area: May on the left, June on the right.
    const { hover } = setup();

    await hover(200);
    expect(await screen.findByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("$150,000")).toBeInTheDocument();
    expect(screen.getByText("$208,400")).toBeInTheDocument();

    await hover(500);
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("$97,000")).toBeInTheDocument();
    expect(screen.queryByText("May 2026")).not.toBeInTheDocument();
  });

  it("can be read month by month from the keyboard", async () => {
    const { user, chart } = setup();

    await user.tab();
    expect(chart).toHaveFocus();
    expect(await screen.findByText("May 2026")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
  });

  it("charts the real insights payload, folding small categories into Other", async () => {
    const { series, rows } = buildTrend(
      insights.categoryTrend,
      insights.trendCategories,
    );
    const { hover, segments } = setup(series, rows);

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(segments("Other")).toHaveLength(2);

    await hover(500);
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("Total").parentElement).toHaveTextContent(
      "Total$138,000",
    );
  });
});
