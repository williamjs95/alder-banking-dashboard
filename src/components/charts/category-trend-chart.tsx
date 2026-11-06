"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryTrendMonth } from "@/lib/contracts";
import { formatMonth, formatMonthYear } from "@/lib/dates";
import { CATEGORY_LABELS, type Category } from "@/lib/domain";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { AXIS_TICK, ChartLegend, ChartTooltip } from "./chart-tooltip";

/** Categories past this many fold into "Other" rather than getting a new hue. */
export const MAX_TREND_SERIES = 5;
const SLOT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
const OTHER_COLOR = "var(--chart-other)";

export type TrendSeries = { key: string; name: string; color: string };
export type TrendRow = { month: string; total: number } & Record<
  string,
  number | string
>;

/**
 * Shapes monthly category spend for a stacked chart: the largest categories
 * each get a fixed color slot, and everything else is summed into "Other".
 */
export function buildTrend(
  months: readonly CategoryTrendMonth[],
  categories: readonly Category[],
): { series: TrendSeries[]; rows: TrendRow[] } {
  const top = categories.slice(0, MAX_TREND_SERIES);
  const rest = categories.slice(MAX_TREND_SERIES);
  const series: TrendSeries[] = top.map((category, index) => ({
    key: category,
    name: CATEGORY_LABELS[category],
    color: SLOT_COLORS[index],
  }));
  if (rest.length > 0) {
    series.push({ key: "rest", name: "Other", color: OTHER_COLOR });
  }

  const rows = months.map(({ month, totals }) => {
    const row: TrendRow = { month, total: 0 };
    for (const category of top) row[category] = totals[category] ?? 0;
    if (rest.length > 0) {
      row.rest = rest.reduce(
        (sum, category) => sum + (totals[category] ?? 0),
        0,
      );
    }
    row.total = series.reduce(
      (sum, item) => sum + (row[item.key] as number),
      0,
    );
    return row;
  });
  return { series, rows };
}

export function TrendTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  series: readonly TrendSeries[];
}) {
  const row = payload?.[0]?.payload as TrendRow | undefined;
  if (!active || !row) return null;
  return (
    <ChartTooltip
      title={formatMonthYear(row.month)}
      // Listed top-down in the order the segments are stacked.
      rows={[...series].reverse().map((item) => ({
        name: item.name,
        value: formatMoney(row[item.key] as number, { whole: true }),
        color: item.color,
      }))}
      footer={
        <span className="flex justify-between gap-3">
          <span className="text-muted-foreground">Total</span>
          <span className="tabular font-semibold">
            {formatMoney(row.total, { whole: true })}
          </span>
        </span>
      }
    />
  );
}

const HEIGHT = 280;

/** Monthly spend, stacked by category, so both the total and its mix are visible. */
export function CategoryTrendChart({
  series,
  rows,
}: {
  series: readonly TrendSeries[];
  rows: readonly TrendRow[];
}) {
  return (
    <div className="grid gap-3">
      <ChartLegend items={series} />
      <ResponsiveContainer
        width="100%"
        height={HEIGHT}
        initialDimension={{ width: 640, height: HEIGHT }}
      >
        <BarChart
          data={rows as TrendRow[]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tick={AXIS_TICK}
            tickFormatter={formatMonth}
            tickMargin={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={formatCompactMoney}
            width={56}
          />
          <Tooltip
            content={(props) => <TrendTooltip {...props} series={series} />}
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            isAnimationActive={false}
          />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.name}
              stackId="spend"
              fill={item.color}
              // A surface-colored hairline separates touching segments.
              stroke="var(--card)"
              strokeWidth={2}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function trendTable(
  series: readonly TrendSeries[],
  rows: readonly TrendRow[],
) {
  return {
    columns: ["Month", ...series.map((item) => item.name), "Total"],
    rows: [...rows]
      .reverse()
      .map((row) => [
        formatMonthYear(row.month),
        ...series.map((item) => formatMoney(row[item.key] as number)),
        formatMoney(row.total),
      ]),
  };
}
