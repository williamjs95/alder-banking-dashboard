// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import {
  balanceOf,
  countRows,
  seedLedger,
  seedNeighbour,
  type Ledger,
} from "../../../test/server-ledger";
import type { CreatePaymentInput } from "@/lib/contracts";
import { SETTLEMENT_DELAY_MS } from "@/lib/domain";
import type { Db } from "@/server/db/client";
import { transactions } from "@/server/db/schema";
import { createPayment } from "./payments";
import { INSUFFICIENT_FUNDS_NOTE, settleDue } from "./settlement";

// Checking starts at $100,000.00, with one $900.00 payroll scheduled for
// Jun 25 and one pending card charge with no settlement time.
const CHECKING_START = 10_000_000;
const WIRE_FEE = 1_500;
/** Scheduled payments go out at 15:00 UTC on their date. */
const onJuly1 = new Date("2026-07-01T15:00:00.000Z");
const later = (date: Date, ms: number) => new Date(date.getTime() + ms);

let db: Db;
let ledger: Ledger;

const pay = (
  overrides: Partial<CreatePaymentInput> = {},
  idempotencyKey?: string,
) =>
  createPayment(
    db,
    WORKSPACE_ID,
    {
      fromAccountId: ledger.checking.id,
      recipientId: ledger.recipient.id,
      amountCents: 250_00,
      method: "ach",
      ...overrides,
    },
    { now: NOW, idempotencyKey },
  );

async function rowOf(id: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id));
  return row;
}

const checkingBalance = () => balanceOf(db, ledger.checking.id);

beforeEach(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
});

describe("settleDue", () => {
  describe("pending payments", () => {
    it("keeps a sent payment pending until its settlement time, then posts it", async () => {
      const { payment } = await pay();

      expect(
        await settleDue(db, WORKSPACE_ID, later(NOW, SETTLEMENT_DELAY_MS - 1)),
      ).toEqual({ posted: 0, sent: 0, failed: 0 });
      expect((await rowOf(payment.id)).status).toBe("pending");

      expect(
        await settleDue(db, WORKSPACE_ID, later(NOW, SETTLEMENT_DELAY_MS)),
      ).toEqual({ posted: 1, sent: 0, failed: 0 });
      expect(await rowOf(payment.id)).toMatchObject({
        status: "posted",
        settlesAt: null,
      });
    });

    it("posts a wire and its fee together", async () => {
      const { payment, fee } = await pay({ method: "wire" });

      const result = await settleDue(
        db,
        WORKSPACE_ID,
        later(NOW, SETTLEMENT_DELAY_MS),
      );

      expect(result.posted).toBe(2);
      expect((await rowOf(payment.id)).status).toBe("posted");
      expect((await rowOf(fee!.id)).status).toBe("posted");
    });

    it("does not move the balance again when a payment posts", async () => {
      await pay();
      const afterSending = await checkingBalance();

      await settleDue(db, WORKSPACE_ID, later(NOW, SETTLEMENT_DELAY_MS));

      expect(afterSending).toBe(CHECKING_START - 25_000);
      expect(await checkingBalance()).toBe(afterSending);
    });

    it("leaves a pending row that has no settlement time alone", async () => {
      await settleDue(db, WORKSPACE_ID, later(NOW, 365 * 86_400_000));

      expect((await rowOf(ledger.tx.awsToday.id)).status).toBe("pending");
    });
  });

  describe("scheduled payments", () => {
    it("does nothing before the date arrives", async () => {
      const { payment } = await pay({ scheduledFor: "2026-07-01" });

      await settleDue(db, WORKSPACE_ID, later(onJuly1, -1));

      expect((await rowOf(payment.id)).status).toBe("scheduled");
    });

    it("sends the payment on its date, charges the account, then posts it", async () => {
      const { payment } = await pay({ scheduledFor: "2026-07-01" });
      const before = await checkingBalance();

      const result = await settleDue(db, WORKSPACE_ID, onJuly1);

      // The seeded payroll, due Jun 25, went out in the same pass.
      expect(result).toEqual({ posted: 0, sent: 2, failed: 0 });
      expect(await rowOf(payment.id)).toMatchObject({
        status: "pending",
        settlesAt: later(onJuly1, SETTLEMENT_DELAY_MS),
      });
      expect(await checkingBalance()).toBe(before - 25_000 - 90_000);

      await settleDue(db, WORKSPACE_ID, later(onJuly1, SETTLEMENT_DELAY_MS));
      expect((await rowOf(payment.id)).status).toBe("posted");
    });

    it("charges a scheduled wire's fee when it goes out, as its own transaction", async () => {
      const { payment } = await pay({
        method: "wire",
        scheduledFor: "2026-07-01",
      });
      const before = await checkingBalance();
      const rows = await countRows(db, transactions, WORKSPACE_ID);

      await settleDue(db, WORKSPACE_ID, onJuly1);

      expect(await checkingBalance()).toBe(before - 25_000 - WIRE_FEE - 90_000);
      expect(await countRows(db, transactions, WORKSPACE_ID)).toBe(rows + 1);
      const [fee] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.description, "Outgoing wire fee"));
      expect(fee).toMatchObject({
        amountCents: -WIRE_FEE,
        status: "pending",
        accountId: payment.accountId,
        idempotencyKey: null,
      });
    });

    it("still replays a sent wire, with its fee, under the original key", async () => {
      const first = await pay(
        { method: "wire", scheduledFor: "2026-07-01" },
        "sched-wire",
      );
      await settleDue(db, WORKSPACE_ID, onJuly1);
      const balance = await checkingBalance();

      const replay = await pay(
        { method: "wire", scheduledFor: "2026-07-01" },
        "sched-wire",
      );

      expect(replay.payment.id).toBe(first.payment.id);
      expect(replay.fee).toMatchObject({ amountCents: -WIRE_FEE });
      expect(await checkingBalance()).toBe(balance);
    });

    it("fails a payment the account cannot cover, and says why", async () => {
      const { payment } = await pay({
        amountCents: CHECKING_START * 2,
        scheduledFor: "2026-07-01",
      });

      const result = await settleDue(db, WORKSPACE_ID, onJuly1);

      expect(result).toEqual({ posted: 0, sent: 1, failed: 1 });
      expect(await rowOf(payment.id)).toMatchObject({
        status: "failed",
        settlesAt: null,
        note: INSUFFICIENT_FUNDS_NOTE,
      });
      // Only the payroll that could be paid left the account.
      expect(await checkingBalance()).toBe(CHECKING_START - 90_000);
    });

    it("keeps the memo when a payment fails", async () => {
      const { payment } = await pay({
        amountCents: CHECKING_START * 2,
        scheduledFor: "2026-07-01",
        memo: "Annual retainer",
      });

      await settleDue(db, WORKSPACE_ID, onJuly1);

      expect((await rowOf(payment.id)).note).toBe(
        `Annual retainer (${INSUFFICIENT_FUNDS_NOTE})`,
      );
    });

    it("fails a wire the account can cover only without its fee", async () => {
      const { payment } = await pay({
        method: "wire",
        amountCents: CHECKING_START - 90_000,
        scheduledFor: "2026-07-01",
      });

      await settleDue(db, WORKSPACE_ID, onJuly1);

      expect((await rowOf(payment.id)).status).toBe("failed");
      expect(await checkingBalance()).toBe(CHECKING_START - 90_000);
    });
  });

  it("changes nothing when it runs twice for the same moment", async () => {
    await pay({ scheduledFor: "2026-07-01" });
    await settleDue(db, WORKSPACE_ID, onJuly1);
    const balance = await checkingBalance();

    expect(await settleDue(db, WORKSPACE_ID, onJuly1)).toEqual({
      posted: 0,
      sent: 0,
      failed: 0,
    });
    expect(await checkingBalance()).toBe(balance);
  });

  it("sends a due payment only once when two requests arrive together", async () => {
    const results = await Promise.all([
      settleDue(db, WORKSPACE_ID, onJuly1),
      settleDue(db, WORKSPACE_ID, onJuly1),
    ]);

    expect(results[0].sent + results[1].sent).toBe(1);
    expect(await checkingBalance()).toBe(CHECKING_START - 90_000);
  });

  it("touches only the workspace it was asked about", async () => {
    const neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
    const before = await balanceOf(db, neighbour.account.id);
    const [foreign] = await db
      .insert(transactions)
      .values({
        workspaceId: OTHER_WORKSPACE_ID,
        accountId: neighbour.account.id,
        postedAt: NOW,
        description: "Neighbour's payment",
        amountCents: -1_00,
        category: "other",
        method: "ach",
        status: "scheduled",
        reference: "ALD-NEIGHBOR",
      })
      .returning({ id: transactions.id });

    await settleDue(db, WORKSPACE_ID, onJuly1);

    expect((await rowOf(foreign.id)).status).toBe("scheduled");
    expect(await balanceOf(db, neighbour.account.id)).toBe(before);
  });
});
