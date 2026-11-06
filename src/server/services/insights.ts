import type {
  CategoryComparison,
  CategoryTrendMonth,
  InsightsDto,
} from "@/lib/contracts";
import { addDays, recentMonthKeys, startOfUtcMonth } from "@/lib/dates";
import type { Category } from "@/lib/domain";
import type { DbExecutor } from "@/server/db/client";
import {
  getMonthlyCashflow,
  getSpendByCategory,
  getSpendByMonthAndCategory,
  getTopMerchants,
} from "./analytics";
import { findLargestExpense } from "./transactions";

const TREND_MONTHS = 6;
const TOP_MERCHANTS = 8;

export async function getInsights(
  db: DbExecutor,
  workspaceId: string,
  now: Date,
): Promise<InsightsDto> {
  const thirtyDaysAgo = addDays(now, -30);

  const [trendRows, topMerchants, current, previous, cashflow, largestExpense] =
    await Promise.all([
      getSpendByMonthAndCategory(
        db,
        workspaceId,
        startOfUtcMonth(now, -(TREND_MONTHS - 1)),
      ),
      getTopMerchants(db, workspaceId, addDays(now, -90), now, TOP_MERCHANTS),
      getSpendByCategory(db, workspaceId, thirtyDaysAgo, now),
      getSpendByCategory(db, workspaceId, addDays(now, -60), thirtyDaysAgo),
      // Three full months plus the current partial one.
      getMonthlyCashflow(db, workspaceId, now, 4),
      findLargestExpense(db, workspaceId, thirtyDaysAgo, now),
    ]);

  const categoryTotals = new Map<Category, number>();
  const byMonth = new Map<string, CategoryTrendMonth["totals"]>();
  for (const row of trendRows) {
    categoryTotals.set(
      row.category,
      (categoryTotals.get(row.category) ?? 0) + row.cents,
    );
    const totals = byMonth.get(row.month) ?? {};
    totals[row.category] = row.cents;
    byMonth.set(row.month, totals);
  }

  const previousByCategory = new Map(
    previous.map((row) => [row.category, row.cents]),
  );
  const currentCategories = new Set(current.map((row) => row.category));
  const categoryComparison: CategoryComparison[] = [
    ...current.map((row) => ({
      category: row.category,
      currentCents: row.cents,
      previousCents: previousByCategory.get(row.category) ?? 0,
    })),
    // Categories that had spend last period but none this period.
    ...previous
      .filter((row) => !currentCategories.has(row.category))
      .map((row) => ({
        category: row.category,
        currentCents: 0,
        previousCents: row.cents,
      })),
  ];

  const fullMonths = cashflow.slice(0, -1);
  const average = (pick: (month: (typeof fullMonths)[number]) => number) =>
    Math.round(
      fullMonths.reduce((sum, month) => sum + pick(month), 0) /
        fullMonths.length,
    );

  return {
    categoryTrend: recentMonthKeys(now, TREND_MONTHS).map((month) => ({
      month,
      totals: byMonth.get(month) ?? {},
    })),
    trendCategories: [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => category),
    topMerchants,
    categoryComparison,
    averageMonthlySpendCents: average((month) => month.outflowCents),
    averageMonthlyRevenueCents: average((month) => month.inflowCents),
    largestExpense,
  };
}
