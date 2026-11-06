import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  TransactionDto,
  TransactionFilters,
  TransactionListDto,
  UpdateTransactionInput,
} from "@/lib/contracts";
import { addDays, parseDayKey } from "@/lib/dates";
import type { DbExecutor } from "@/server/db/client";
import { accounts, cards, transactions } from "@/server/db/schema";
import { invalid, notFound } from "@/server/http/errors";

const counterparty = alias(accounts, "counterparty");

const selection = {
  id: transactions.id,
  accountId: transactions.accountId,
  accountName: accounts.name,
  postedAt: transactions.postedAt,
  description: transactions.description,
  amountCents: transactions.amountCents,
  category: transactions.category,
  method: transactions.method,
  status: transactions.status,
  reference: transactions.reference,
  note: transactions.note,
  cardId: transactions.cardId,
  cardLabel: cards.label,
  cardLast4: cards.last4,
  recipientId: transactions.recipientId,
  counterpartyAccountName: counterparty.name,
};

type SelectedRow = Omit<TransactionDto, "postedAt"> & { postedAt: Date };

const toDto = (row: SelectedRow): TransactionDto => ({
  ...row,
  postedAt: row.postedAt.toISOString(),
});

/** Transactions joined with the names the UI shows next to them. */
function selectTransactions(db: DbExecutor) {
  return db
    .select(selection)
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(cards, eq(transactions.cardId, cards.id))
    .leftJoin(
      counterparty,
      eq(transactions.counterpartyAccountId, counterparty.id),
    );
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** "$1,234.50" or "1234.5" typed into search should also match by amount. */
function amountFromSearch(q: string): number | null {
  const cleaned = q.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Math.abs(Number(cleaned)) * 100);
}

type FilterFields = Omit<
  TransactionFilters,
  "sort" | "order" | "page" | "pageSize"
>;

export function buildConditions(
  workspaceId: string,
  filters: Partial<FilterFields>,
): SQL[] {
  const conditions: SQL[] = [eq(transactions.workspaceId, workspaceId)];
  const absolute = sql`abs(${transactions.amountCents})`;

  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    const matches: (SQL | undefined)[] = [
      ilike(transactions.description, pattern),
      ilike(transactions.reference, pattern),
      ilike(transactions.note, pattern),
    ];
    const cents = amountFromSearch(filters.q);
    if (cents !== null) matches.push(sql`${absolute} = ${cents}`);
    conditions.push(or(...matches) as SQL);
  }
  if (filters.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.cardId) conditions.push(eq(transactions.cardId, filters.cardId));
  if (filters.category?.length) {
    conditions.push(inArray(transactions.category, filters.category));
  }
  if (filters.status?.length) {
    conditions.push(inArray(transactions.status, filters.status));
  }
  if (filters.direction === "in") {
    conditions.push(gt(transactions.amountCents, 0));
  }
  if (filters.direction === "out") {
    conditions.push(lt(transactions.amountCents, 0));
  }
  if (filters.from) {
    conditions.push(gte(transactions.postedAt, parseDayKey(filters.from)));
  }
  if (filters.to) {
    // Inclusive of the whole "to" day.
    conditions.push(
      lt(transactions.postedAt, addDays(parseDayKey(filters.to), 1)),
    );
  }
  if (filters.minCents !== undefined) {
    conditions.push(sql`${absolute} >= ${filters.minCents}`);
  }
  if (filters.maxCents !== undefined) {
    conditions.push(sql`${absolute} <= ${filters.maxCents}`);
  }
  return conditions;
}

const sortColumns = {
  date: transactions.postedAt,
  amount: transactions.amountCents,
  description: transactions.description,
} as const;

function orderBy(filters: Pick<TransactionFilters, "sort" | "order">) {
  const direction = filters.order === "asc" ? asc : desc;
  // The id tiebreak keeps pagination stable when sort keys collide.
  return [direction(sortColumns[filters.sort]), direction(transactions.id)];
}

export async function listTransactions(
  db: DbExecutor,
  workspaceId: string,
  filters: TransactionFilters,
): Promise<TransactionListDto> {
  const where = and(...buildConditions(workspaceId, filters));

  const [totals] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      // Failed payments never moved money, so they stay out of the totals.
      inflowCents:
        sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 and ${transactions.status} <> 'failed' then ${transactions.amountCents} else 0 end), 0)`.mapWith(
          Number,
        ),
      outflowCents:
        sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 and ${transactions.status} <> 'failed' then -${transactions.amountCents} else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(where);

  const pageCount = Math.max(1, Math.ceil(totals.total / filters.pageSize));
  const page = Math.min(filters.page, pageCount);

  const rows = await selectTransactions(db)
    .where(where)
    .orderBy(...orderBy(filters))
    .limit(filters.pageSize)
    .offset((page - 1) * filters.pageSize);

  return {
    items: rows.map(toDto),
    total: totals.total,
    page,
    pageSize: filters.pageSize,
    pageCount,
    summary: {
      inflowCents: totals.inflowCents,
      outflowCents: totals.outflowCents,
      netCents: totals.inflowCents - totals.outflowCents,
    },
  };
}

/** Upper bound on an export so one request cannot pull an unbounded result. */
export const EXPORT_LIMIT = 5_000;

export async function exportTransactions(
  db: DbExecutor,
  workspaceId: string,
  filters: TransactionFilters,
): Promise<TransactionDto[]> {
  const rows = await selectTransactions(db)
    .where(and(...buildConditions(workspaceId, filters)))
    .orderBy(...orderBy(filters))
    .limit(EXPORT_LIMIT);
  return rows.map(toDto);
}

export async function getTransaction(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<TransactionDto> {
  const [row] = await selectTransactions(db)
    .where(
      and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)),
    )
    .limit(1);
  if (!row) throw notFound("Transaction");
  return toDto(row);
}

/** Looks up the row a retried request created the first time, if any. */
export async function findByIdempotencyKey(
  db: DbExecutor,
  workspaceId: string,
  key: string,
): Promise<TransactionDto | null> {
  const [row] = await selectTransactions(db)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.idempotencyKey, key),
      ),
    )
    .limit(1);
  return row ? toDto(row) : null;
}

export async function updateTransaction(
  db: DbExecutor,
  workspaceId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDto> {
  const current = await getTransaction(db, workspaceId, id);

  if (
    input.category !== undefined &&
    (current.category === "transfer" || current.category === "interest")
  ) {
    throw invalid("This transaction's category is set by the bank.", {
      category: "Category cannot be changed",
    });
  }

  await db
    .update(transactions)
    .set({
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
    })
    .where(
      and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)),
    );

  return getTransaction(db, workspaceId, id);
}

export async function listRecent(
  db: DbExecutor,
  workspaceId: string,
  limit: number,
): Promise<TransactionDto[]> {
  const rows = await selectTransactions(db)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        ne(transactions.status, "scheduled"),
      ),
    )
    .orderBy(desc(transactions.postedAt), desc(transactions.id))
    .limit(limit);
  return rows.map(toDto);
}

export async function listUpcoming(
  db: DbExecutor,
  workspaceId: string,
  limit: number,
): Promise<TransactionDto[]> {
  const rows = await selectTransactions(db)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.status, "scheduled"),
      ),
    )
    .orderBy(asc(transactions.postedAt), asc(transactions.id))
    .limit(limit);
  return rows.map(toDto);
}

export async function findLargestExpense(
  db: DbExecutor,
  workspaceId: string,
  since: Date,
  until: Date,
): Promise<TransactionDto | null> {
  const [row] = await selectTransactions(db)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        inArray(transactions.status, ["posted", "pending"]),
        ne(transactions.category, "transfer"),
        lt(transactions.amountCents, 0),
        gte(transactions.postedAt, since),
        lte(transactions.postedAt, until),
      ),
    )
    .orderBy(asc(transactions.amountCents), asc(transactions.id))
    .limit(1);
  return row ? toDto(row) : null;
}
