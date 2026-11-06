import { and, asc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { SETTLEMENT_DELAY_MS, WIRE_FEE_CENTS } from "@/lib/domain";
import type { Db } from "@/server/db/client";
import { accounts, transactions } from "@/server/db/schema";
import { feeKey, newReference } from "./payments";

export type SettlementResult = {
  /** Pending transactions that reached their settlement time and posted. */
  posted: number;
  /** Scheduled payments whose date arrived and were sent. */
  sent: number;
  /** Scheduled payments that could not be sent for lack of funds. */
  failed: number;
};

export const INSUFFICIENT_FUNDS_NOTE =
  "Not sent: the account did not have enough funds on the scheduled date.";

/**
 * Sends one scheduled payment. The row is claimed first, by moving it out of
 * "scheduled" in the same transaction as the debit, so two requests arriving
 * together cannot both send it: the one that loses the update finds nothing
 * left to claim.
 */
async function sendScheduled(
  db: Db,
  workspaceId: string,
  id: string,
  now: Date,
): Promise<"sent" | "failed" | "skipped"> {
  return db.transaction(async (tx) => {
    const settlesAt = new Date(now.getTime() + SETTLEMENT_DELAY_MS);
    const [payment] = await tx
      .update(transactions)
      .set({ status: "pending", settlesAt })
      .where(
        and(
          eq(transactions.id, id),
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.status, "scheduled"),
        ),
      )
      .returning();
    if (!payment) return "skipped";

    // Money leaves on the day the payment goes out, not when it was scheduled.
    const feeCents = payment.method === "wire" ? WIRE_FEE_CENTS : 0;
    const totalCents = -payment.amountCents + feeCents;
    const debited = await tx
      .update(accounts)
      .set({ balanceCents: sql`${accounts.balanceCents} - ${totalCents}` })
      .where(
        and(
          eq(accounts.id, payment.accountId),
          gte(accounts.balanceCents, totalCents),
        ),
      )
      .returning({ id: accounts.id });

    if (debited.length === 0) {
      await tx
        .update(transactions)
        .set({
          status: "failed",
          settlesAt: null,
          note: payment.note
            ? `${payment.note} (${INSUFFICIENT_FUNDS_NOTE})`
            : INSUFFICIENT_FUNDS_NOTE,
        })
        .where(eq(transactions.id, payment.id));
      return "failed";
    }

    if (feeCents > 0) {
      await tx.insert(transactions).values({
        workspaceId,
        accountId: payment.accountId,
        postedAt: now,
        description: "Outgoing wire fee",
        amountCents: -feeCents,
        category: "other",
        method: "wire",
        status: "pending",
        settlesAt,
        reference: newReference(),
        note: `Fee for wire to ${payment.description}`,
        idempotencyKey: payment.idempotencyKey
          ? feeKey(payment.idempotencyKey)
          : null,
      });
    }
    return "sent";
  });
}

/**
 * Moves a workspace's payments forward to where they should be at `now`:
 * pending transactions past their settlement time post, and scheduled payments
 * whose date has arrived are sent (or fail, if the account cannot cover them).
 *
 * There is no background worker. This runs at the start of every request for
 * the workspace, which is when anyone could observe the difference. It is
 * idempotent: running it twice at the same instant changes nothing the second
 * time.
 */
export async function settleDue(
  db: Db,
  workspaceId: string,
  now: Date,
): Promise<SettlementResult> {
  // Posting changes only the status: a pending debit already left the balance.
  const posted = await db
    .update(transactions)
    .set({ status: "posted", settlesAt: null })
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.status, "pending"),
        isNotNull(transactions.settlesAt),
        lte(transactions.settlesAt, now),
      ),
    )
    .returning({ id: transactions.id });

  const due = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.status, "scheduled"),
        lte(transactions.postedAt, now),
      ),
    )
    .orderBy(asc(transactions.postedAt), asc(transactions.id));

  const result: SettlementResult = {
    posted: posted.length,
    sent: 0,
    failed: 0,
  };
  for (const { id } of due) {
    const outcome = await sendScheduled(db, workspaceId, id, now);
    if (outcome === "sent") result.sent += 1;
    if (outcome === "failed") result.failed += 1;
  }
  return result;
}
