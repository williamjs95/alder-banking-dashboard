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
import type { CashflowMonth } from "@/lib/contracts";
import { formatMonth, formatMonthYear } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { AXIS_TICK, ChartLegend, ChartTooltip } from "./chart-tooltip";

const SERIES = [
  { key: "inflowCents", name: "Money in", color: "var(--chart-1)" },
  { key: "outflowCents", name: "Money out", color: "var(--chart-2)" },
] as const;

export function CashflowTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}) {
  const month = payload?.[0]?.payload as CashflowMonth | undefined;
  if (!active || !month) return null;
  return (
    <ChartTooltip
      title={formatMonthYear(month.month)}
      rows={SERIES.map((series) => ({
        name: series.name,
        value: formatMoney(month[series.key], { whole: true }),
        color: series.color,
      }))}
      footer={
        <span className="flex justify-between gap-3">
          <span className="text-muted-foreground">Net</span>
          <span className="tabular font-semibold">
            {formatMoney(month.netCents, { whole: true, signed: true })}
          </span>
        </span>
      }
    />
  );
}

const HEIGHT = 240;

/** Money in against money out, month by month, on one shared axis. */
export function CashflowChart({ data }: { data: readonly CashflowMonth[] }) {
  return (
    <div className="grid gap-3">
      <ChartLegend items={SERIES} />
      <ResponsiveContainer
        width="100%"
        height={HEIGHT}
        initialDimension={{ width: 640, height: HEIGHT }}
      >
        <BarChart
          data={data as CashflowMonth[]}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barGap={2}
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
            content={CashflowTooltip}
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            isAnimationActive={false}
          />
          {SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.name}
              fill={series.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function cashflowTable(data: readonly CashflowMonth[]) {
  return {
    columns: ["Month", "Money in", "Money out", "Net"],
    rows: [...data]
      .reverse()
      .map((month) => [
        formatMonthYear(month.month),
        formatMoney(month.inflowCents),
        formatMoney(month.outflowCents),
        formatMoney(month.netCents, { signed: true }),
      ]),
  };
}
