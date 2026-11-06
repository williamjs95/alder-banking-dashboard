"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  buildTrend,
  CategoryTrendChart,
  trendTable,
} from "@/components/charts/category-trend-chart";
import { ChartCard } from "@/components/charts/chart-card";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Delta } from "@/components/shared/delta";
import { Money } from "@/components/shared/money";
import { StatStrip, StatTile } from "@/components/shared/stat-tile";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { CATEGORY_LABELS } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { insightsQuery } from "@/lib/queries";

/** Where the money goes: spend mix over time, top payees and what changed. */
export function InsightsView() {
  const { data: insights } = useSuspenseQuery(insightsQuery);
  const trend = buildTrend(insights.categoryTrend, insights.trendCategories);
  const { largestExpense } = insights;

  return (
    <div className="grid gap-4">
      <StatStrip className="sm:grid-cols-3">
        <StatTile
          label="Average monthly spend"
          value={<Money cents={insights.averageMonthlySpendCents} whole />}
          footer={
            <span className="text-xs text-muted-foreground">
              Last 3 full months
            </span>
          }
        />
        <StatTile
          label="Average monthly revenue"
          value={<Money cents={insights.averageMonthlyRevenueCents} whole />}
          footer={
            <span className="text-xs text-muted-foreground">
              Last 3 full months
            </span>
          }
        />
        <StatTile
          label="Largest expense · 30 days"
          value={
            largestExpense ? (
              <Money cents={-largestExpense.amountCents} whole />
            ) : (
              "None"
            )
          }
          footer={
            largestExpense ? (
              <Link
                href={`/transactions?tx=${largestExpense.id}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {largestExpense.description} ·{" "}
                {formatDate(largestExpense.postedAt)}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                No spend in the last 30 days
              </span>
            )
          }
        />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Spend by category"
          description="Monthly spend for the last six months. The current month is partial."
          className="lg:col-span-2"
          table={trendTable(trend.series, trend.rows)}
        >
          <CategoryTrendChart series={trend.series} rows={trend.rows} />
        </ChartCard>

        <Card className="gap-3 px-5 py-4 shadow-none">
          <div>
            <h2 className="text-sm font-medium">Top payees</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Last 90 days</p>
          </div>
          <RankedBars
            items={insights.topMerchants.map((merchant) => ({
              key: merchant.description,
              label: merchant.description,
              detail: `${merchant.count} ${merchant.count === 1 ? "payment" : "payments"}`,
              value: merchant.cents,
              display: formatMoney(merchant.cents, { whole: true }),
              href: `/transactions?q=${encodeURIComponent(merchant.description)}&direction=out`,
            }))}
          />
        </Card>
      </div>

      <Card className="gap-3 px-5 py-4 shadow-none">
        <div>
          <h2 className="text-sm font-medium">What changed</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Spend in the last 30 days against the 30 days before
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Last 30 days</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Previous 30 days
              </TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {insights.categoryComparison.map((row) => (
              <TableRow key={row.category}>
                <TableCell className="font-medium">
                  {CATEGORY_LABELS[row.category]}
                </TableCell>
                <TableCell className="text-right">
                  <Money cents={row.currentCents} whole />
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                  <Money cents={row.previousCents} whole />
                </TableCell>
                <TableCell className="text-right">
                  <Delta
                    current={row.currentCents}
                    previous={row.previousCents}
                    goodWhen="down"
                    label=""
                    className="justify-end"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
