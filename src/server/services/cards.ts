import { randomInt } from "node:crypto";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type {
  CardDto,
  CreateCardInput,
  UpdateCardInput,
} from "@/lib/contracts";
import { startOfUtcMonth } from "@/lib/dates";
import { SETTLED_STATUSES } from "@/lib/domain";
import type { DbExecutor } from "@/server/db/client";
import { accounts, cards, transactions } from "@/server/db/schema";
import { notFound } from "@/server/http/errors";
import { getAccountRow } from "./accounts";

const CARD_VALID_YEARS = 4;

/** Card spend per card for the calendar month containing `now`. */
async function spendThisMonth(
  db: DbExecutor,
  workspaceId: string,
  now: Date,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      cardId: transactions.cardId,
      cents:
        sql<number>`coalesce(sum(-${transactions.amountCents}), 0)`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        isNotNull(transactions.cardId),
        inArray(transactions.status, SETTLED_STATUSES),
        gte(transactions.postedAt, startOfUtcMonth(now)),
      ),
    )
    .groupBy(transactions.cardId);
  return new Map(rows.map((row) => [row.cardId as string, row.cents]));
}

export async function listCards(
  db: DbExecutor,
  workspaceId: string,
  now: Date,
): Promise<CardDto[]> {
  const [rows, spend] = await Promise.all([
    db
      .select({ card: cards, accountName: accounts.name })
      .from(cards)
      .innerJoin(accounts, eq(cards.accountId, accounts.id))
      .where(eq(cards.workspaceId, workspaceId))
      .orderBy(asc(cards.createdAt), asc(cards.id)),
    spendThisMonth(db, workspaceId, now),
  ]);

  return rows.map(({ card, accountName }) => ({
    id: card.id,
    accountId: card.accountId,
    accountName,
    label: card.label,
    holderName: card.holderName,
    last4: card.last4,
    type: card.type,
    status: card.status,
    monthlyLimitCents: card.monthlyLimitCents,
    spentThisMonthCents: spend.get(card.id) ?? 0,
    expMonth: card.expMonth,
    expYear: card.expYear,
  }));
}

async function getCard(
  db: DbExecutor,
  workspaceId: string,
  id: string,
  now: Date,
): Promise<CardDto> {
  const card = (await listCards(db, workspaceId, now)).find(
    (candidate) => candidate.id === id,
  );
  if (!card) throw notFound("Card");
  return card;
}

/** Issues a virtual card, ready to use immediately. */
export async function createCard(
  db: DbExecutor,
  workspaceId: string,
  input: CreateCardInput,
  now: Date,
): Promise<CardDto> {
  const account = await getAccountRow(db, workspaceId, input.accountId);
  const [row] = await db
    .insert(cards)
    .values({
      workspaceId,
      accountId: account.id,
      label: input.label,
      holderName: input.holderName,
      last4: String(randomInt(10_000)).padStart(4, "0"),
      type: "virtual",
      status: "active",
      monthlyLimitCents: input.monthlyLimitCents,
      expMonth: now.getUTCMonth() + 1,
      expYear: now.getUTCFullYear() + CARD_VALID_YEARS,
      createdAt: now,
    })
    .returning({ id: cards.id });
  return getCard(db, workspaceId, row.id, now);
}

/** Freezes or unfreezes a card, or changes its monthly limit. */
export async function updateCard(
  db: DbExecutor,
  workspaceId: string,
  id: string,
  input: UpdateCardInput,
  now: Date,
): Promise<CardDto> {
  const updated = await db
    .update(cards)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.monthlyLimitCents !== undefined
        ? { monthlyLimitCents: input.monthlyLimitCents }
        : {}),
    })
    .where(and(eq(cards.workspaceId, workspaceId), eq(cards.id, id)))
    .returning({ id: cards.id });
  if (updated.length === 0) throw notFound("Card");
  return getCard(db, workspaceId, id, now);
}
