// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  addTransaction,
  countRows,
  seedLedger,
  seedNeighbour,
  utc,
  type Ledger,
} from "../../../test/server-ledger";
import type { Db } from "@/server/db/client";
import { cards, workspaces } from "@/server/db/schema";
import { createCard, listCards, updateCard } from "./cards";

// See test/server-ledger.ts for the rows these figures are derived from.
let db: Db;
let ledger: Ledger;
let neighbour: Awaited<ReturnType<typeof seedNeighbour>>;

const cardNotFound = {
  code: "not_found",
  status: 404,
  message: "Card was not found.",
};

const byLabel = async (label: string, now = NOW) =>
  (await listCards(db, WORKSPACE_ID, now)).find(
    (card) => card.label === label,
  )!;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(workspaces);
  ledger = await seedLedger(db, WORKSPACE_ID);
  neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
});

describe("listCards", () => {
  it("lists the workspace's cards oldest first with their funding account", async () => {
    const list = await listCards(db, WORKSPACE_ID, NOW);

    expect(list.map((card) => card.label)).toEqual([
      "Cloud",
      "Software",
      "Events",
    ]);
    expect(list[0]).toEqual({
      id: ledger.cloudCard.id,
      accountId: ledger.checking.id,
      accountName: "Checking",
      label: "Cloud",
      holderName: "Maya Chen",
      last4: "4417",
      type: "virtual",
      status: "active",
      monthlyLimitCents: 500_000,
      spentThisMonthCents: 12_000,
      expMonth: 12,
      expYear: 2029,
    });
    expect(list[2].status).toBe("frozen");
  });

  it("totals this calendar month's spend per card, starting at midnight UTC on the 1st", async () => {
    const list = await listCards(db, WORKSPACE_ID, NOW);

    expect(list.map((card) => [card.label, card.spentThisMonthCents])).toEqual([
      // Pending AWS 12,000 in June; the May charge is last month's.
      ["Cloud", 12_000],
      // Slack 8,000 + Notion 8,000 (Jun 1 00:00:00); Figma on May 31 is not.
      ["Software", 16_000],
      ["Events", 0],
    ]);
  });

  it("leaves failed and scheduled charges out of the spend and nets refunds", async () => {
    const june = utc("2026-06-10T12:00:00");
    const onCloudCard = {
      method: "card",
      cardId: ledger.cloudCard.id,
    } as const;
    await addTransaction(db, ledger.checking, {
      ...onCloudCard,
      postedAt: june,
      amountCents: -5_000,
      status: "failed",
    });
    await addTransaction(db, ledger.checking, {
      ...onCloudCard,
      postedAt: utc("2026-06-28T12:00:00"),
      amountCents: -7_000,
      status: "scheduled",
    });
    await addTransaction(db, ledger.checking, {
      ...onCloudCard,
      postedAt: june,
      amountCents: 2_000,
      description: "Refund",
    });

    expect((await byLabel("Cloud")).spentThisMonthCents).toBe(10_000);
  });

  it("starts every card at zero spend when a new month begins", async () => {
    const list = await listCards(db, WORKSPACE_ID, utc("2026-07-01T00:00:00"));

    expect(list.map((card) => card.spentThisMonthCents)).toEqual([0, 0, 0]);
  });

  it("shows each workspace only its own cards and spend", async () => {
    const theirs = await listCards(db, OTHER_WORKSPACE_ID, NOW);

    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({
      id: neighbour.card.id,
      label: "Neighbour card",
      accountName: "Neighbour Checking",
      spentThisMonthCents: 777_700,
    });
    expect(await listCards(db, UNKNOWN_ID, NOW)).toEqual([]);
  });
});

describe("createCard", () => {
  const input = () => ({
    label: "Conference travel",
    holderName: "Priya Patel",
    accountId: ledger.checking.id,
    monthlyLimitCents: 2_500_00,
  });

  it("issues an active virtual card that expires four years from now", async () => {
    const card = await createCard(db, WORKSPACE_ID, input(), NOW);

    expect(card).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      accountId: ledger.checking.id,
      accountName: "Checking",
      label: "Conference travel",
      holderName: "Priya Patel",
      last4: expect.stringMatching(/^\d{4}$/),
      type: "virtual",
      status: "active",
      monthlyLimitCents: 250_000,
      spentThisMonthCents: 0,
      expMonth: 6,
      expYear: 2030,
    });
  });

  it("adds the new card to the end of the list", async () => {
    const card = await createCard(db, WORKSPACE_ID, input(), NOW);
    const list = await listCards(db, WORKSPACE_ID, NOW);

    expect(list).toHaveLength(4);
    expect(list.at(-1)).toEqual(card);
  });

  it("can fund a card from any of the workspace's accounts", async () => {
    const card = await createCard(
      db,
      WORKSPACE_ID,
      { ...input(), accountId: ledger.savings.id },
      NOW,
    );

    expect(card.accountName).toBe("Savings");
  });

  it("refuses an account that does not exist", async () => {
    await expect(
      createCard(db, WORKSPACE_ID, { ...input(), accountId: UNKNOWN_ID }, NOW),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
      message: "Account was not found.",
    });
    expect(await countRows(db, cards, WORKSPACE_ID)).toBe(3);
  });

  it("refuses to issue a card against another workspace's account", async () => {
    await expect(
      createCard(
        db,
        WORKSPACE_ID,
        { ...input(), accountId: neighbour.account.id },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(await countRows(db, cards, WORKSPACE_ID)).toBe(3);
    expect(await countRows(db, cards, OTHER_WORKSPACE_ID)).toBe(1);
  });
});

describe("updateCard", () => {
  it("freezes a card without touching its limit or spend", async () => {
    const updated = await updateCard(
      db,
      WORKSPACE_ID,
      ledger.cloudCard.id,
      { status: "frozen" },
      NOW,
    );

    expect(updated).toMatchObject({
      id: ledger.cloudCard.id,
      status: "frozen",
      monthlyLimitCents: 500_000,
      spentThisMonthCents: 12_000,
    });
    expect((await byLabel("Cloud")).status).toBe("frozen");
  });

  it("unfreezes a frozen card", async () => {
    const updated = await updateCard(
      db,
      WORKSPACE_ID,
      ledger.frozenCard.id,
      { status: "active" },
      NOW,
    );

    expect(updated.status).toBe("active");
    expect((await byLabel("Events")).status).toBe("active");
  });

  it("changes the monthly limit without touching the status", async () => {
    const updated = await updateCard(
      db,
      WORKSPACE_ID,
      ledger.frozenCard.id,
      { monthlyLimitCents: 9_000_00 },
      NOW,
    );

    expect(updated).toMatchObject({
      status: "frozen",
      monthlyLimitCents: 900_000,
    });
  });

  it("can change status and limit together", async () => {
    const updated = await updateCard(
      db,
      WORKSPACE_ID,
      ledger.softwareCard.id,
      { status: "frozen", monthlyLimitCents: 100_00 },
      NOW,
    );

    expect(updated).toMatchObject({
      status: "frozen",
      monthlyLimitCents: 10_000,
    });
  });

  it("leaves the other cards alone", async () => {
    await updateCard(
      db,
      WORKSPACE_ID,
      ledger.cloudCard.id,
      { status: "frozen", monthlyLimitCents: 100_00 },
      NOW,
    );

    expect(await byLabel("Software")).toMatchObject({
      status: "active",
      monthlyLimitCents: 500_000,
    });
  });

  it("reports an unknown card as not found", async () => {
    await expect(
      updateCard(db, WORKSPACE_ID, UNKNOWN_ID, { status: "frozen" }, NOW),
    ).rejects.toMatchObject(cardNotFound);
  });

  it("cannot change another workspace's card", async () => {
    await expect(
      updateCard(
        db,
        WORKSPACE_ID,
        neighbour.card.id,
        { status: "frozen", monthlyLimitCents: 100_00 },
        NOW,
      ),
    ).rejects.toMatchObject(cardNotFound);

    const [theirs] = await listCards(db, OTHER_WORKSPACE_ID, NOW);
    expect(theirs).toMatchObject({
      status: "active",
      monthlyLimitCents: 500_000,
    });
  });

  it("reports a card that is deleted while it is being updated as not found", async () => {
    // The database runs queries in the order they are issued: the update, then
    // this delete, then the read-back that `updateCard` does last.
    const [update] = await Promise.allSettled([
      updateCard(
        db,
        WORKSPACE_ID,
        ledger.cloudCard.id,
        { status: "frozen" },
        NOW,
      ),
      db.delete(cards).where(eq(cards.id, ledger.cloudCard.id)),
    ]);

    expect(update).toMatchObject({ status: "rejected", reason: cardNotFound });
  });
});
