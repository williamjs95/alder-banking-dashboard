import { and, asc, eq } from "drizzle-orm";
import type {
  AccountDetailDto,
  AccountDto,
  AccountNumbersDto,
} from "@/lib/contracts";
import { addDays } from "@/lib/dates";
import type { DbExecutor } from "@/server/db/client";
import { accounts, type AccountRow } from "@/server/db/schema";
import { notFound } from "@/server/http/errors";
import { getBalanceSeries, getFlowTotals } from "./analytics";

export const HISTORY_DAYS = 365;

/** Full account numbers never ride along with ordinary responses. */
export const toAccountDto = (row: AccountRow): AccountDto => ({
  id: row.id,
  name: row.name,
  type: row.type,
  last4: row.accountNumber.slice(-4),
  balanceCents: row.balanceCents,
  apyBps: row.apyBps,
});

export async function listAccountRows(
  db: DbExecutor,
  workspaceId: string,
): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId))
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));
}

export async function listAccounts(
  db: DbExecutor,
  workspaceId: string,
): Promise<AccountDto[]> {
  return (await listAccountRows(db, workspaceId)).map(toAccountDto);
}

export async function getAccountRow(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<AccountRow> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, id)))
    .limit(1);
  if (!row) throw notFound("Account");
  return row;
}

export async function getAccountDetail(
  db: DbExecutor,
  workspaceId: string,
  id: string,
  now: Date,
): Promise<AccountDetailDto> {
  const row = await getAccountRow(db, workspaceId, id);
  const [balanceSeries, last30Days] = await Promise.all([
    getBalanceSeries(
      db,
      workspaceId,
      row.balanceCents,
      now,
      HISTORY_DAYS,
      row.id,
    ),
    getFlowTotals(db, workspaceId, addDays(now, -30), now, row.id),
  ]);
  return { account: toAccountDto(row), balanceSeries, last30Days };
}

/** The sensitive numbers, fetched only when someone asks to reveal them. */
export async function getAccountNumbers(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<AccountNumbersDto> {
  const row = await getAccountRow(db, workspaceId, id);
  return {
    accountNumber: row.accountNumber,
    routingNumber: row.routingNumber,
  };
}
