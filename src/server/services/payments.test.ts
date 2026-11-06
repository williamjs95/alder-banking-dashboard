// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  addAccount,
  addRecipient,
  balanceOf,
  countRows,
  ledgerRows,
  seedLedger,
  seedNeighbour,
  type Ledger,
} from "../../../test/server-ledger";
import type { CreatePaymentInput, CreateTransferInput } from "@/lib/contracts";
import type { Db } from "@/server/db/client";
import { transactions, workspaces } from "@/server/db/schema";
import { createPayment, createTransfer, newReference } from "./payments";

// Checking starts at $100,000.00 and Savings at $50,000.00, with 15 ledger
// rows already in place (see test/server-ledger.ts).
const CHECKING_START = 10_000_000;
const SAVINGS_START = 5_000_000;
const NEIGHBOUR_START = 900_000_000;
const ROWS_START = 15;
const WIRE_FEE = 1_500;

let db: Db;
let ledger: Ledger;
let neighbour: Awaited<ReturnType<typeof seedNeighbour>>;

const payment = (overrides: Partial<CreatePaymentInput> = {}) => ({
  fromAccountId: ledger.checking.id,
  recipientId: ledger.recipient.id,
  amountCents: 250_00,
  method: "ach" as const,
  ...overrides,
});

const transfer = (overrides: Partial<CreateTransferInput> = {}) => ({
  fromAccountId: ledger.checking.id,
  toAccountId: ledger.savings.id,
  amountCents: 1_000_00,
  ...overrides,
});

const pay = (
  overrides: Partial<CreatePaymentInput> = {},
  idempotencyKey?: string,
) =>
  createPayment(db, WORKSPACE_ID, payment(overrides), {
    now: NOW,
    idempotencyKey,
  });

const move = (
  overrides: Partial<CreateTransferInput> = {},
  idempotencyKey?: string,
) =>
  createTransfer(db, WORKSPACE_ID, transfer(overrides), {
    now: NOW,
    idempotencyKey,
  });

const checkingBalance = () => balanceOf(db, ledger.checking.id);
const savingsBalance = () => balanceOf(db, ledger.savings.id);
const rowCount = () => countRows(db, transactions, WORKSPACE_ID);

/** Asserts that a rejected request left no trace in the workspace. */
async function expectNothingChanged() {
  expect(await checkingBalance()).toBe(CHECKING_START);
  expect(await savingsBalance()).toBe(SAVINGS_START);
  expect(await rowCount()).toBe(ROWS_START);
}

const insufficientFunds = (accountName: string) => ({
  code: "insufficient_funds",
  status: 422,
  message: `${accountName} does not have enough available funds.`,
  fields: { amountCents: "Amount exceeds the available balance" },
});

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(workspaces);
  ledger = await seedLedger(db, WORKSPACE_ID);
  neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
});

describe("newReference", () => {
  it("looks like ALD- followed by eight unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(newReference()).toMatch(/^ALD-[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it("does not repeat in practice", () => {
    const references = Array.from({ length: 500 }, newReference);

    expect(new Set(references).size).toBe(500);
  });
});

describe("createPayment", () => {
  describe("sending now", () => {
    it("debits the account and records a pending ACH payment", async () => {
      const { payment: sent, fee } = await pay({ memo: "Invoice 1042" });

      expect(await checkingBalance()).toBe(CHECKING_START - 25_000);
      expect(fee).toBeNull();
      expect(sent).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        accountId: ledger.checking.id,
        accountName: "Checking",
        postedAt: NOW.toISOString(),
        description: "Acme Supplies",
        amountCents: -25_000,
        category: "other",
        method: "ach",
        status: "pending",
        reference: expect.stringMatching(/^ALD-[A-HJ-NP-Z2-9]{8}$/),
        note: "Invoice 1042",
        cardId: null,
        cardLabel: null,
        cardLast4: null,
        recipientId: ledger.recipient.id,
        counterpartyAccountName: null,
      });
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("charges a $15 fee on a wire, as its own ledger row", async () => {
      const { payment: sent, fee } = await pay({ method: "wire" });

      expect(await checkingBalance()).toBe(CHECKING_START - 25_000 - WIRE_FEE);
      expect(sent).toMatchObject({ amountCents: -25_000, method: "wire" });
      expect(fee).toMatchObject({
        accountId: ledger.checking.id,
        description: "Outgoing wire fee",
        amountCents: -1_500,
        category: "other",
        method: "wire",
        status: "pending",
        note: "Fee for wire to Acme Supplies",
        postedAt: NOW.toISOString(),
        recipientId: null,
      });
      expect(fee?.id).not.toBe(sent.id);
      expect(fee?.reference).not.toBe(sent.reference);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("stores no note when the memo is missing or empty", async () => {
      const withoutMemo = await pay();
      const emptyMemo = await pay({ memo: "" });

      expect(withoutMemo.payment.note).toBeNull();
      expect(emptyMemo.payment.note).toBeNull();
    });

    it("can pay from any account in the workspace and leaves the others untouched", async () => {
      await pay({ fromAccountId: ledger.savings.id, amountCents: 40_00 });

      expect(await savingsBalance()).toBe(SAVINGS_START - 4_000);
      expect(await checkingBalance()).toBe(CHECKING_START);
      expect(await balanceOf(db, neighbour.account.id)).toBe(NEIGHBOUR_START);
    });

    it("lets the account be emptied to exactly zero", async () => {
      await pay({ amountCents: CHECKING_START });

      expect(await checkingBalance()).toBe(0);
    });

    it("keeps the ledger and the balance in step across several payments", async () => {
      await pay({ amountCents: 100_00 });
      await pay({ amountCents: 200_00, method: "wire" });
      await pay({ amountCents: 300_00 });

      const added = (await ledgerRows(db, WORKSPACE_ID)).filter(
        (row) => row.postedAt.getTime() === NOW.getTime(),
      );
      const moved = added.reduce((sum, row) => sum + row.amountCents, 0);

      expect(added).toHaveLength(4);
      expect(moved).toBe(-(10_000 + 20_000 + 1_500 + 30_000));
      expect(await checkingBalance()).toBe(CHECKING_START + moved);
    });
  });

  describe("insufficient funds", () => {
    it("rejects a payment larger than the balance and changes nothing", async () => {
      await expect(
        pay({ amountCents: CHECKING_START + 1 }),
      ).rejects.toMatchObject(insufficientFunds("Checking"));
      await expectNothingChanged();
    });

    it("counts the wire fee against the balance", async () => {
      await expect(
        pay({ amountCents: CHECKING_START - WIRE_FEE + 1, method: "wire" }),
      ).rejects.toMatchObject(insufficientFunds("Checking"));
      await expectNothingChanged();

      await pay({ amountCents: CHECKING_START - WIRE_FEE, method: "wire" });
      expect(await checkingBalance()).toBe(0);
    });

    it("lets only one of two simultaneous payments spend the same money", async () => {
      const sixtyPercent = CHECKING_START * 0.6;

      const results = await Promise.allSettled([
        pay({ amountCents: sixtyPercent }),
        pay({ amountCents: sixtyPercent }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: insufficientFunds("Checking") });
      expect(await checkingBalance()).toBe(CHECKING_START - sixtyPercent);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });
  });

  describe("scheduling", () => {
    it("records a scheduled payment for mid-morning on the chosen day and moves no money", async () => {
      const { payment: scheduled, fee } = await pay({
        scheduledFor: "2026-07-01",
        memo: "July rent",
      });

      expect(scheduled).toMatchObject({
        status: "scheduled",
        postedAt: "2026-07-01T15:00:00.000Z",
        amountCents: -25_000,
        method: "ach",
        note: "July rent",
        recipientId: ledger.recipient.id,
      });
      expect(fee).toBeNull();
      expect(await checkingBalance()).toBe(CHECKING_START);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("does not charge the wire fee until a scheduled wire is sent", async () => {
      const { payment: scheduled, fee } = await pay({
        method: "wire",
        scheduledFor: "2026-06-19",
      });

      expect(scheduled).toMatchObject({ status: "scheduled", method: "wire" });
      expect(fee).toBeNull();
      expect(await checkingBalance()).toBe(CHECKING_START);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("reserves nothing, so a payment larger than today's balance can be scheduled", async () => {
      const { payment: scheduled } = await pay({
        amountCents: CHECKING_START * 2,
        scheduledFor: "2026-08-15",
      });

      expect(scheduled.status).toBe("scheduled");
      expect(await checkingBalance()).toBe(CHECKING_START);
    });

    it.each(["2026-06-18", "2026-06-17", "2025-12-31"])(
      "rejects %s because it is not after today",
      async (scheduledFor) => {
        await expect(pay({ scheduledFor })).rejects.toMatchObject({
          code: "validation_error",
          status: 422,
          message: "Choose a date in the future.",
          fields: { scheduledFor: "Choose a date in the future" },
        });
        await expectNothingChanged();
      },
    );

    it("judges 'today' in UTC, using the clock it was given", async () => {
      const lateEvening = new Date("2026-06-18T23:59:59.000Z");
      const justAfterMidnight = new Date("2026-06-19T00:00:00.000Z");
      const tomorrow = payment({ scheduledFor: "2026-06-19" });

      const accepted = await createPayment(db, WORKSPACE_ID, tomorrow, {
        now: lateEvening,
      });
      expect(accepted.payment.status).toBe("scheduled");

      await expect(
        createPayment(db, WORKSPACE_ID, tomorrow, { now: justAfterMidnight }),
      ).rejects.toMatchObject({ code: "validation_error" });
    });
  });

  describe("unknown or foreign parties", () => {
    it("rejects an unknown account", async () => {
      await expect(pay({ fromAccountId: UNKNOWN_ID })).rejects.toMatchObject({
        code: "not_found",
        status: 404,
        message: "Account was not found.",
      });
      await expectNothingChanged();
    });

    it("rejects an unknown recipient", async () => {
      await expect(pay({ recipientId: UNKNOWN_ID })).rejects.toMatchObject({
        code: "not_found",
        status: 404,
        message: "Recipient was not found.",
      });
      await expectNothingChanged();
    });

    it("cannot pay out of another workspace's account", async () => {
      await expect(
        pay({ fromAccountId: neighbour.account.id }),
      ).rejects.toMatchObject({ code: "not_found", status: 404 });

      expect(await balanceOf(db, neighbour.account.id)).toBe(NEIGHBOUR_START);
      expect(await countRows(db, transactions, OTHER_WORKSPACE_ID)).toBe(1);
      await expectNothingChanged();
    });

    it("cannot pay another workspace's recipient", async () => {
      await expect(
        pay({ recipientId: neighbour.recipient.id }),
      ).rejects.toMatchObject({
        code: "not_found",
        status: 404,
        message: "Recipient was not found.",
      });
      await expectNothingChanged();
    });
  });

  describe("idempotency", () => {
    it("returns the original payment when a key is replayed and moves the money once", async () => {
      const first = await pay({}, "pay-001");
      const replay = await pay({}, "pay-001");

      expect(replay).toEqual(first);
      expect(await checkingBalance()).toBe(CHECKING_START - 25_000);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("refuses a replayed key that describes a different payment", async () => {
      const otherRecipient = await addRecipient(db, WORKSPACE_ID);
      await pay({}, "pay-002");

      const different: Partial<CreatePaymentInput>[] = [
        { amountCents: 300_00 },
        { method: "wire" },
        { fromAccountId: ledger.savings.id },
        { recipientId: otherRecipient.id },
      ];
      for (const change of different) {
        await expect(pay(change, "pay-002")).rejects.toMatchObject({
          code: "conflict",
          status: 409,
          message:
            "This Idempotency-Key was already used for a different request.",
        });
      }

      // Only the original payment moved money.
      expect(await checkingBalance()).toBe(CHECKING_START - 25_000);
      expect(await savingsBalance()).toBe(SAVINGS_START);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("refuses a payment that reuses a transfer's key", async () => {
      await move({}, "shared-001");

      await expect(pay({}, "shared-001")).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      });

      expect(await checkingBalance()).toBe(CHECKING_START - 100_000);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("replays a wire together with its fee", async () => {
      const first = await pay({ method: "wire" }, "wire-001");
      const replay = await pay({ method: "wire" }, "wire-001");

      expect(first.fee).not.toBeNull();
      expect(replay).toEqual(first);
      expect(await checkingBalance()).toBe(CHECKING_START - 25_000 - WIRE_FEE);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("replays a scheduled payment without creating a second one", async () => {
      const first = await pay({ scheduledFor: "2026-07-01" }, "sched-001");
      const replay = await pay({ scheduledFor: "2026-07-01" }, "sched-001");

      expect(replay).toEqual(first);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("treats different keys, and requests without a key, as separate payments", async () => {
      const first = await pay({}, "pay-001");
      const second = await pay({}, "pay-002");
      const third = await pay();
      const fourth = await pay();

      expect(
        new Set(
          [first, second, third, fourth].map((result) => result.payment.id),
        ).size,
      ).toBe(4);
      expect(await checkingBalance()).toBe(CHECKING_START - 4 * 25_000);
    });

    it("does not record a failed attempt, so the same key can succeed later", async () => {
      await expect(
        pay({ amountCents: CHECKING_START + 1 }, "retry-001"),
      ).rejects.toMatchObject({ code: "insufficient_funds" });

      const retried = await pay({ amountCents: 500_00 }, "retry-001");

      expect(retried.payment.amountCents).toBe(-50_000);
      expect(await checkingBalance()).toBe(CHECKING_START - 50_000);
    });

    it("answers two simultaneous requests with the same key with one payment", async () => {
      const [first, second] = await Promise.all([
        pay({}, "double-click"),
        pay({}, "double-click"),
      ]);

      expect(second).toEqual(first);
      expect(await checkingBalance()).toBe(CHECKING_START - 25_000);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });

    it("scopes keys to the workspace", async () => {
      // The neighbour already has a transaction stored under this key.
      const mine = await pay({}, "neighbour-key");

      expect(mine.payment.id).not.toBe(neighbour.transaction.id);
      expect(mine.payment.description).toBe("Acme Supplies");
      expect(await checkingBalance()).toBe(CHECKING_START - 25_000);
      expect(await balanceOf(db, neighbour.account.id)).toBe(NEIGHBOUR_START);
    });
  });

  describe("atomicity", () => {
    it("rolls back the debit and the payment row when a later write fails", async () => {
      // An earlier payment happens to own the key the wire fee would use, so
      // the fee insert hits the unique index after the debit and payment row.
      await pay({ amountCents: 1_00 }, "wire-777:fee");

      await expect(
        pay({ method: "wire", amountCents: 900_00 }, "wire-777"),
      ).rejects.toMatchObject({ cause: { code: "23505" } });

      expect(await checkingBalance()).toBe(CHECKING_START - 100);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });
  });
});

describe("createTransfer", () => {
  it("moves the money between the two accounts in one step", async () => {
    await move();

    expect(await checkingBalance()).toBe(CHECKING_START - 100_000);
    expect(await savingsBalance()).toBe(SAVINGS_START + 100_000);
  });

  it("records a posted debit leg and a matching credit leg", async () => {
    const { debit, credit } = await move({ memo: "Top up reserve" });

    expect(debit).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      accountId: ledger.checking.id,
      accountName: "Checking",
      postedAt: NOW.toISOString(),
      description: "Transfer to Savings",
      amountCents: -100_000,
      category: "transfer",
      method: "transfer",
      status: "posted",
      reference: expect.stringMatching(/^ALD-[A-HJ-NP-Z2-9]{8}$/),
      note: "Top up reserve",
      cardId: null,
      cardLabel: null,
      cardLast4: null,
      recipientId: null,
      counterpartyAccountName: "Savings",
    });
    expect(credit).toMatchObject({
      accountId: ledger.savings.id,
      accountName: "Savings",
      postedAt: NOW.toISOString(),
      description: "Transfer from Checking",
      amountCents: 100_000,
      category: "transfer",
      method: "transfer",
      status: "posted",
      note: "Top up reserve",
      counterpartyAccountName: "Checking",
    });
    expect(credit.id).not.toBe(debit.id);
    expect(await rowCount()).toBe(ROWS_START + 2);
  });

  it("never changes the company's total cash", async () => {
    await move({ amountCents: 12_345_67 });
    await move({
      fromAccountId: ledger.savings.id,
      toAccountId: ledger.checking.id,
      amountCents: 999_99,
    });

    expect((await checkingBalance()) + (await savingsBalance())).toBe(
      CHECKING_START + SAVINGS_START,
    );
    expect(await checkingBalance()).toBe(CHECKING_START - 1_234_567 + 99_999);
  });

  it("stores no note when the memo is missing or empty", async () => {
    const withoutMemo = await move();
    const emptyMemo = await move({ memo: "" });

    expect(withoutMemo.debit.note).toBeNull();
    expect(withoutMemo.credit.note).toBeNull();
    expect(emptyMemo.debit.note).toBeNull();
  });

  it("lets the source account be emptied to exactly zero", async () => {
    await move({ amountCents: CHECKING_START });

    expect(await checkingBalance()).toBe(0);
    expect(await savingsBalance()).toBe(SAVINGS_START + CHECKING_START);
  });

  it("rejects a transfer larger than the source balance and changes nothing", async () => {
    await expect(
      move({ amountCents: CHECKING_START + 1 }),
    ).rejects.toMatchObject(insufficientFunds("Checking"));
    await expectNothingChanged();
  });

  it("names the right account when the source is savings", async () => {
    await expect(
      move({
        fromAccountId: ledger.savings.id,
        toAccountId: ledger.checking.id,
        amountCents: SAVINGS_START + 1,
      }),
    ).rejects.toMatchObject(insufficientFunds("Savings"));
    await expectNothingChanged();
  });

  it("lets only one of two simultaneous transfers spend the same money", async () => {
    const seventyPercent = CHECKING_START * 0.7;

    const results = await Promise.allSettled([
      move({ amountCents: seventyPercent }),
      move({ amountCents: seventyPercent }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await checkingBalance()).toBe(CHECKING_START - seventyPercent);
    expect(await savingsBalance()).toBe(SAVINGS_START + seventyPercent);
    expect(await rowCount()).toBe(ROWS_START + 2);
  });

  it.each([
    ["source", { fromAccountId: UNKNOWN_ID }],
    ["destination", { toAccountId: UNKNOWN_ID }],
  ])("rejects an unknown %s account", async (_label, overrides) => {
    await expect(move(overrides)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
      message: "Account was not found.",
    });
    await expectNothingChanged();
  });

  it("cannot pull money out of another workspace's account", async () => {
    await expect(
      move({ fromAccountId: neighbour.account.id }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    expect(await balanceOf(db, neighbour.account.id)).toBe(NEIGHBOUR_START);
    await expectNothingChanged();
  });

  it("cannot push money into another workspace's account", async () => {
    await expect(
      move({ toAccountId: neighbour.account.id }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    expect(await balanceOf(db, neighbour.account.id)).toBe(NEIGHBOUR_START);
    expect(await countRows(db, transactions, OTHER_WORKSPACE_ID)).toBe(1);
    await expectNothingChanged();
  });

  describe("idempotency", () => {
    it("returns the original legs when a key is replayed and moves the money once", async () => {
      const first = await move({}, "xfer-001");
      const replay = await move({}, "xfer-001");

      expect(replay).toEqual(first);
      expect(await checkingBalance()).toBe(CHECKING_START - 100_000);
      expect(await savingsBalance()).toBe(SAVINGS_START + 100_000);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("refuses a replayed key that describes a different transfer", async () => {
      const reserve = await addAccount(db, WORKSPACE_ID, {
        name: "Reserve",
        balanceCents: 0,
      });
      await move({}, "xfer-003");

      const different: Partial<CreateTransferInput>[] = [
        { amountCents: 2_000_00 },
        { toAccountId: reserve.id },
        { fromAccountId: reserve.id },
      ];
      for (const change of different) {
        await expect(move(change, "xfer-003")).rejects.toMatchObject({
          code: "conflict",
          status: 409,
          message:
            "This Idempotency-Key was already used for a different request.",
        });
      }

      expect(await checkingBalance()).toBe(CHECKING_START - 100_000);
      expect(await savingsBalance()).toBe(SAVINGS_START + 100_000);
      expect(await balanceOf(db, reserve.id)).toBe(0);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("treats different keys, and requests without a key, as separate transfers", async () => {
      await move({}, "xfer-001");
      await move({}, "xfer-002");
      await move();
      await move();

      expect(await checkingBalance()).toBe(CHECKING_START - 400_000);
      expect(await rowCount()).toBe(ROWS_START + 8);
    });

    it("answers two simultaneous requests with the same key with one transfer", async () => {
      const [first, second] = await Promise.all([
        move({}, "double-click"),
        move({}, "double-click"),
      ]);

      expect(second).toEqual(first);
      expect(await savingsBalance()).toBe(SAVINGS_START + 100_000);
      expect(await rowCount()).toBe(ROWS_START + 2);
    });

    it("refuses a key that a payment already used, and moves nothing", async () => {
      await pay({ amountCents: 1_00 }, "shared-key");

      await expect(move({}, "shared-key")).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      });

      expect(await checkingBalance()).toBe(CHECKING_START - 100);
      expect(await savingsBalance()).toBe(SAVINGS_START);
      expect(await rowCount()).toBe(ROWS_START + 1);
    });
  });
});
