import { and, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import type {
  BalancePoint,
  CashflowMonth,
  CategoryTotal,
  FlowTotals,
  MerchantTotal,
} from "@/lib/contracts";
import {
  addDays,
  recentDayKeys,
  recentMonthKeys,
  startOfUtcDay,
  startOfUtcMonth,
} from "@/lib/dates";
import { SETTLED_STATUSES, type Category } from "@/lib/domain";
import type { DbExecutor } from "@/server/db/client";
import { transactions } from "@/server/db/schema";

/**
 * Aggregations over the ledger. They run in SQL so the cost stays flat as a
 * workspace's history grows; JavaScript only fills gaps and shapes results.
 */

const amount = transactions.amountCents;
const inflow = sql<number>`coalesce(sum(case when ${amount} > 0 then ${amount} else 0 end), 0)`;
const outflow = sql<number>`coalesce(sum(case when ${amount} < 0 then -${amount} else 0 end), 0)`;
const utcDay = sql<string>`to_char(${transactions.postedAt} at time zone 'UTC', 'YYYY-MM-DD')`;
const utcMonth = sql<string>`to_char(${transactions.postedAt} at time zone 'UTC', 'YYYY-MM')`;

/** Rows that moved money in the workspace (optionally one account). */
function settled(workspaceId: string, accountId?: string): SQL[] {
  return [
    eq(transactions.workspaceId, workspaceId),
    inArray(transactions.status, SETTLED_STATUSES),
    ...(accountId ? [eq(transactions.accountId, accountId)] : []),
  ];
}

/**
 * Real money in and out. Workspace-wide figures skip internal transfers, which
 * only shuffle cash between the company's own accounts; for a single account a
 * transfer is a genuine movement, so it counts.
 */
function external(workspaceId: string, accountId?: string): SQL[] {
  return [
    ...settled(workspaceId, accountId),
    ...(accountId ? [] : [ne(transactions.category, "transfer")]),
  ];
}

/**
 * Daily closing balances for the last `days` days, oldest first. Derived by
 * walking back from the current balance through each day's net movement, so
 * the chart always reconciles with the ledger.
 */
export async function getBalanceSeries(
  db: DbExecutor,
  workspaceId: string,
  currentBalanceCents: number,
  now: Date,
  days: number,
  accountId?: string,
): Promise<BalancePoint[]> {
  const since = addDays(startOfUtcDay(now), -(days - 1));
  const rows = await db
    .select({
      day: utcDay,
      netCents: sql<number>`sum(${amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ...settled(workspaceId, accountId),
        gte(transactions.postedAt, since),
      ),
    )
    .groupBy(utcDay);

  const netByDay = new Map(rows.map((row) => [row.day, row.netCents]));
  const keys = recentDayKeys(now, days);
  const series: BalancePoint[] = new Array(keys.length);
  let balance = currentBalanceCents;
  for (let index = keys.length - 1; index >= 0; index--) {
    series[index] = { date: keys[index], balanceCents: balance };
    balance -= netByDay.get(keys[index]) ?? 0;
  }
  return series;
}

/** Money in and out during [since, until). */
export async function getFlowTotals(
  db: DbExecutor,
  workspaceId: string,
  since: Date,
  until: Date,
  accountId?: string,
): Promise<FlowTotals> {
  const [row] = await db
    .select({
      inflowCents: inflow.mapWith(Number),
      outflowCents: outflow.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ...external(workspaceId, accountId),
        gte(transactions.postedAt, since),
        lt(transactions.postedAt, until),
      ),
    );
  return row;
}

/** Money in and out for each of the last `months` calendar months, oldest first. */
export async function getMonthlyCashflow(
  db: DbExecutor,
  workspaceId: string,
  now: Date,
  months: number,
): Promise<CashflowMonth[]> {
  const rows = await db
    .select({
      month: utcMonth,
      inflowCents: inflow.mapWith(Number),
      outflowCents: outflow.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ...external(workspaceId),
        gte(transactions.postedAt, startOfUtcMonth(now, -(months - 1))),
      ),
    )
    .groupBy(utcMonth);

  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return recentMonthKeys(now, months).map((month) => {
    const row = byMonth.get(month);
    const inflowCents = row?.inflowCents ?? 0;
    const outflowCents = row?.outflowCents ?? 0;
    return {
      month,
      inflowCents,
      outflowCents,
      netCents: inflowCents - outflowCents,
    };
  });
}

/** Spend per category during [since, until), largest first. */
export async function getSpendByCategory(
  db: DbExecutor,
  workspaceId: string,
  since: Date,
  until: Date,
): Promise<CategoryTotal[]> {
  const rows = await db
    .select({ category: transactions.category, cents: outflow.mapWith(Number) })
    .from(transactions)
    .where(
      and(
        ...external(workspaceId),
        lt(amount, 0),
        gte(transactions.postedAt, since),
        lt(transactions.postedAt, until),
      ),
    )
    .groupBy(transactions.category);
  return rows.sort((a, b) => b.cents - a.cents);
}

/** Spend per month and category from the start of `since`'s month. */
export async function getSpendByMonthAndCategory(
  db: DbExecutor,
  workspaceId: string,
  since: Date,
): Promise<{ month: string; category: Category; cents: number }[]> {
  return db
    .select({
      month: utcMonth,
      category: transactions.category,
      cents: outflow.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ...external(workspaceId),
        lt(amount, 0),
        gte(transactions.postedAt, since),
      ),
    )
    .groupBy(utcMonth, transactions.category);
}

/** The payees that received the most money during [since, until). */
export async function getTopMerchants(
  db: DbExecutor,
  workspaceId: string,
  since: Date,
  until: Date,
  limit: number,
): Promise<MerchantTotal[]> {
  const rows = await db
    .select({
      description: transactions.description,
      cents: outflow.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        ...external(workspaceId),
        lt(amount, 0),
        gte(transactions.postedAt, since),
        lt(transactions.postedAt, until),
      ),
    )
    .groupBy(transactions.description);
  return rows
    .sort(
      (a, b) => b.cents - a.cents || a.description.localeCompare(b.description),
    )
    .slice(0, limit);
}

/**
 * Average monthly net outflow over the last three full months. Positive means
 * the company is burning cash; the current partial month is ignored.
 */
export function monthlyBurn(cashflow: CashflowMonth[]): number {
  const fullMonths = cashflow.slice(0, -1).slice(-3);
  if (fullMonths.length === 0) return 0;
  const net = fullMonths.reduce((sum, month) => sum + month.netCents, 0);
  return Math.round(-net / fullMonths.length);
}

/** Months of cash left at the current burn, or null when not burning. */
export function runwayMonths(
  totalBalanceCents: number,
  burnCents: number,
): number | null {
  if (burnCents <= 0) return null;
  return Math.round((totalBalanceCents / burnCents) * 10) / 10;
}
