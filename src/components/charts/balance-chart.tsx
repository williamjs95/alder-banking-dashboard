"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BalancePoint } from "@/lib/contracts";
import { formatDate, formatDateWithYear } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { AXIS_TICK, ChartTooltip } from "./chart-tooltip";

export const BALANCE_RANGES = [
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "365", label: "1Y" },
] as const;
export type BalanceRange = (typeof BALANCE_RANGES)[number]["value"];

/** The trailing `range` days of a daily series. */
export function sliceRange(
  series: readonly BalancePoint[],
  range: BalanceRange,
): BalancePoint[] {
  return series.slice(-Number(range));
}

export function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const point = payload?.[0]?.payload as BalancePoint | undefined;
  if (!active || !point) return null;
  return (
    <ChartTooltip
      title={formatDateWithYear(point.date)}
      rows={[
        {
          name: "Balance",
          value: formatMoney(point.balanceCents),
          color: "var(--chart-1)",
        },
      ]}
    />
  );
}

const HEIGHT = 240;

/**
 * Closing balance per day. A single series, so there is no legend: the card
 * title says what is plotted. The y-axis is fitted to the data rather than
 * anchored at zero, because the question is how the balance moved.
 */
export function BalanceChart({ data }: { data: readonly BalancePoint[] }) {
  const gradientId = useId();
  return (
    <ResponsiveContainer
      width="100%"
      height={HEIGHT}
      initialDimension={{ width: 640, height: HEIGHT }}
    >
      <AreaChart
        data={data as BalancePoint[]}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        accessibilityLayer
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={{ stroke: "var(--chart-axis)" }}
          tick={AXIS_TICK}
          tickFormatter={formatDate}
          tickMargin={8}
          minTickGap={56}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickFormatter={formatCompactMoney}
          width={56}
          domain={["auto", "auto"]}
        />
        <Tooltip
          content={BalanceTooltip}
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="balanceCents"
          name="Balance"
          stroke="var(--chart-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** The same numbers as a table, newest first. */
export function balanceTable(data: readonly BalancePoint[]) {
  return {
    columns: ["Date", "Balance"],
    rows: [...data]
      .reverse()
      .map((point) => [
        formatDateWithYear(point.date),
        formatMoney(point.balanceCents),
      ]),
  };
}
