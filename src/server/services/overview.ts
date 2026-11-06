import type { OverviewDto } from "@/lib/contracts";
import { addDays } from "@/lib/dates";
import type { DbExecutor } from "@/server/db/client";
import { HISTORY_DAYS, listAccounts } from "./accounts";
import {
  getBalanceSeries,
  getFlowTotals,
  getMonthlyCashflow,
  getSpendByCategory,
  monthlyBurn,
  runwayMonths,
} from "./analytics";
import { listRecent, listUpcoming } from "./transactions";

const RECENT_LIMIT = 7;
const UPCOMING_LIMIT = 5;
const CASHFLOW_MONTHS = 12;

/** Everything the overview page shows, in one round trip. */
export async function getOverview(
  db: DbExecutor,
  workspaceId: string,
  now: Date,
): Promise<OverviewDto> {
  const accounts = await listAccounts(db, workspaceId);
  const totalBalanceCents = accounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const thirtyDaysAgo = addDays(now, -30);

  const [
    balanceSeries,
    last30Days,
    previous30Days,
    cashflow,
    spendByCategory,
    recent,
    upcoming,
  ] = await Promise.all([
    getBalanceSeries(db, workspaceId, totalBalanceCents, now, HISTORY_DAYS),
    getFlowTotals(db, workspaceId, thirtyDaysAgo, now),
    getFlowTotals(db, workspaceId, addDays(now, -60), thirtyDaysAgo),
    getMonthlyCashflow(db, workspaceId, now, CASHFLOW_MONTHS),
    getSpendByCategory(db, workspaceId, thirtyDaysAgo, now),
    listRecent(db, workspaceId, RECENT_LIMIT),
    listUpcoming(db, workspaceId, UPCOMING_LIMIT),
  ]);

  const monthlyBurnCents = monthlyBurn(cashflow);

  return {
    totalBalanceCents,
    accounts,
    balanceSeries,
    last30Days,
    previous30Days,
    cashflow,
    spendByCategory,
    monthlyBurnCents,
    runwayMonths: runwayMonths(totalBalanceCents, monthlyBurnCents),
    recent,
    upcoming,
  };
}
