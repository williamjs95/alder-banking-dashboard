import { randomInt } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type {
  CreatePaymentInput,
  CreateTransferInput,
  PaymentResultDto,
  TransferResultDto,
} from "@/lib/contracts";
import { dayKey, parseDayKey } from "@/lib/dates";
import { WIRE_FEE_CENTS } from "@/lib/domain";
import type { Db, DbExecutor } from "@/server/db/client";
import {
  accounts,
  transactions,
  type NewTransactionRow,
} from "@/server/db/schema";
import { conflict, insufficientFunds, invalid } from "@/server/http/errors";
import { getAccountRow } from "./accounts";
import { getRecipientRow } from "./recipients";
import { findByIdempotencyKey, getTransaction } from "./transactions";

export type MovementOptions = {
  now: Date;
  /** Client-generated key. Replaying it returns the original result. */
  idempotencyKey?: string;
};

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newReference(): string {
  let out = "ALD-";
  for (let i = 0; i < 8; i++) {
    out += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return out;
}

/**
 * Takes money out of an account only if the balance covers it. The check and
 * the write are one statement, so two concurrent debits cannot both succeed
 * against the same funds.
 */
async function debit(
  tx: DbExecutor,
  account: { id: string; name: string },
  cents: number,
): Promise<void> {
  const updated = await tx
    .update(accounts)
    .set({ balanceCents: sql`${accounts.balanceCents} - ${cents}` })
    .where(and(eq(accounts.id, account.id), gte(accounts.balanceCents, cents)))
    .returning({ id: accounts.id });
  if (updated.length === 0) throw insufficientFunds(account.name);
}

async function credit(
  tx: DbExecutor,
  accountId: string,
  cents: number,
): Promise<void> {
  await tx
    .update(accounts)
    .set({ balanceCents: sql`${accounts.balanceCents} + ${cents}` })
    .where(eq(accounts.id, accountId));
}

async function insertTransaction(
  tx: DbExecutor,
  row: Omit<NewTransactionRow, "reference">,
): Promise<string> {
  const [inserted] = await tx
    .insert(transactions)
    .values({ ...row, reference: newReference() })
    .returning({ id: transactions.id });
  return inserted.id;
}

/**
 * Replaying a key is only safe when it repeats the original request. The same
 * key with a different amount, account or recipient is a client bug, and
 * answering it with the earlier result would hide that.
 */
const keyReused = () =>
  conflict("This Idempotency-Key was already used for a different request.");

const feeKey = (key: string) => `${key}:fee`;
const creditKey = (key: string) => `${key}:credit`;

/**
 * Sends money to a recipient by ACH or wire, now or on a future date.
 * Everything happens in one database transaction: either the balance moves
 * and the ledger rows exist, or nothing changed.
 */
export async function createPayment(
  db: Db,
  workspaceId: string,
  input: CreatePaymentInput,
  { now, idempotencyKey }: MovementOptions,
): Promise<PaymentResultDto> {
  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      const payment = await findByIdempotencyKey(
        tx,
        workspaceId,
        idempotencyKey,
      );
      if (payment) {
        const sameRequest =
          payment.method === input.method &&
          payment.accountId === input.fromAccountId &&
          payment.recipientId === input.recipientId &&
          payment.amountCents === -input.amountCents;
        if (!sameRequest) throw keyReused();
        const fee = await findByIdempotencyKey(
          tx,
          workspaceId,
          feeKey(idempotencyKey),
        );
        return { payment, fee };
      }
    }

    const account = await getAccountRow(tx, workspaceId, input.fromAccountId);
    const recipient = await getRecipientRow(tx, workspaceId, input.recipientId);

    const scheduled = input.scheduledFor !== undefined;
    if (scheduled && input.scheduledFor! <= dayKey(now)) {
      throw invalid("Choose a date in the future.", {
        scheduledFor: "Choose a date in the future",
      });
    }

    // Scheduled payments reserve nothing today; the fee is charged on send.
    const feeCents = input.method === "wire" && !scheduled ? WIRE_FEE_CENTS : 0;
    if (!scheduled) await debit(tx, account, input.amountCents + feeCents);

    const paymentId = await insertTransaction(tx, {
      workspaceId,
      accountId: account.id,
      recipientId: recipient.id,
      // Scheduled payments go out mid-morning on the chosen day.
      postedAt: scheduled
        ? new Date(parseDayKey(input.scheduledFor!).getTime() + 15 * 3_600_000)
        : now,
      description: recipient.name,
      amountCents: -input.amountCents,
      category: "other",
      method: input.method,
      status: scheduled ? "scheduled" : "pending",
      note: input.memo || null,
      idempotencyKey: idempotencyKey ?? null,
    });

    const feeId =
      feeCents > 0
        ? await insertTransaction(tx, {
            workspaceId,
            accountId: account.id,
            postedAt: now,
            description: "Outgoing wire fee",
            amountCents: -feeCents,
            category: "other",
            method: "wire",
            status: "pending",
            note: `Fee for wire to ${recipient.name}`,
            idempotencyKey: idempotencyKey ? feeKey(idempotencyKey) : null,
          })
        : null;

    return {
      payment: await getTransaction(tx, workspaceId, paymentId),
      fee: feeId ? await getTransaction(tx, workspaceId, feeId) : null,
    };
  });
}

/** Moves money between two of the company's own accounts, instantly. */
export async function createTransfer(
  db: Db,
  workspaceId: string,
  input: CreateTransferInput,
  { now, idempotencyKey }: MovementOptions,
): Promise<TransferResultDto> {
  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      const debitLeg = await findByIdempotencyKey(
        tx,
        workspaceId,
        idempotencyKey,
      );
      const creditLeg = await findByIdempotencyKey(
        tx,
        workspaceId,
        creditKey(idempotencyKey),
      );
      if (debitLeg) {
        const sameRequest =
          creditLeg !== null &&
          debitLeg.accountId === input.fromAccountId &&
          creditLeg.accountId === input.toAccountId &&
          debitLeg.amountCents === -input.amountCents;
        if (!sameRequest) throw keyReused();
        return { debit: debitLeg, credit: creditLeg };
      }
    }

    const from = await getAccountRow(tx, workspaceId, input.fromAccountId);
    const to = await getAccountRow(tx, workspaceId, input.toAccountId);

    await debit(tx, from, input.amountCents);
    await credit(tx, to.id, input.amountCents);

    const shared = {
      workspaceId,
      postedAt: now,
      category: "transfer",
      method: "transfer",
      status: "posted",
      note: input.memo || null,
    } as const;

    const debitId = await insertTransaction(tx, {
      ...shared,
      accountId: from.id,
      counterpartyAccountId: to.id,
      description: `Transfer to ${to.name}`,
      amountCents: -input.amountCents,
      idempotencyKey: idempotencyKey ?? null,
    });
    const creditId = await insertTransaction(tx, {
      ...shared,
      accountId: to.id,
      counterpartyAccountId: from.id,
      description: `Transfer from ${from.name}`,
      amountCents: input.amountCents,
      idempotencyKey: idempotencyKey ? creditKey(idempotencyKey) : null,
    });

    return {
      debit: await getTransaction(tx, workspaceId, debitId),
      credit: await getTransaction(tx, workspaceId, creditId),
    };
  });
}
