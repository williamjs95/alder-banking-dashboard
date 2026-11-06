// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW, sequentialIds, WORKSPACE_ID } from "../../../test/db";
import {
  ACCOUNT_SEEDS,
  CARD_SEEDS,
  RECIPIENT_SEEDS,
  RULES,
  type AccountKey,
} from "./catalog";
import {
  DEFAULT_SEED,
  generateSeed,
  HISTORY_DAYS,
  SCHEDULE_DAYS,
  type SeedData,
} from "./generator";

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const build = (now = NOW, seed?: number) =>
  generateSeed({
    workspaceId: WORKSPACE_ID,
    now,
    seed,
    newId: sequentialIds(),
  });

const startOfDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const when = (row: SeedData["transactions"][number]) => row.postedAt as Date;
const isLastDayOfMonth = (date: Date) =>
  new Date(date.getTime() + DAY_MS).getUTCDate() === 1;

function accountId(data: SeedData, key: AccountKey): string {
  return data.accounts.find((account) => account.type === key)!.id;
}

const data = build();
const today = startOfDay(NOW);
const settled = data.transactions.filter(
  (row) => row.status === "posted" || row.status === "pending",
);
const named = (description: string) =>
  data.transactions.filter((row) => row.description === description);

describe("generateSeed", () => {
  describe("reproducibility", () => {
    it("builds exactly the same company for the same seed, clock and ids", () => {
      expect(build()).toEqual(data);
    });

    it("builds a different ledger for a different seed", () => {
      const other = build(NOW, DEFAULT_SEED + 1);

      expect(other.transactions.map((row) => row.amountCents)).not.toEqual(
        data.transactions.map((row) => row.amountCents),
      );
    });

    it("falls back to the default seed and to random row ids", () => {
      const first = generateSeed({ workspaceId: WORKSPACE_ID, now: NOW });
      const second = generateSeed({ workspaceId: WORKSPACE_ID, now: NOW });
      const business = (seed: SeedData) =>
        seed.transactions.map((row) => [
          row.description,
          row.amountCents,
          row.reference,
          when(row).toISOString(),
        ]);

      expect(business(first)).toEqual(business(data));
      expect(business(second)).toEqual(business(data));

      const ids = [
        ...first.accounts,
        ...first.cards,
        ...first.recipients,
        ...first.transactions,
      ].map((row) => row.id);
      for (const id of ids) expect(id).toMatch(UUID);
      expect(new Set(ids).size).toBe(ids.length);
      expect(second.accounts[0].id).not.toBe(first.accounts[0].id);
    });

    it("gives every row a distinct id", () => {
      const ids = [
        ...data.accounts,
        ...data.cards,
        ...data.recipients,
        ...data.transactions,
      ].map((row) => row.id);

      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("workspace, accounts, cards and recipients", () => {
    it("creates the workspace for the requested id, stamped with the clock", () => {
      expect(data.workspace).toEqual({
        id: WORKSPACE_ID,
        companyName: "Brightline Labs, Inc.",
        createdAt: NOW,
      });
    });

    it("creates checking, savings and treasury accounts in display order", () => {
      expect(
        data.accounts.map((account) => [
          account.sortOrder,
          account.type,
          account.name,
          account.accountNumber,
          account.apyBps,
        ]),
      ).toEqual([
        [0, "checking", "Operating Checking", "202418874821", 0],
        [1, "savings", "Savings Reserve", "202418877730", 390],
        [2, "treasury", "Treasury", "202418871094", 460],
      ]);
    });

    it("sets each balance to the opening balance plus every settled or pending movement", () => {
      for (const account of data.accounts) {
        const moved = settled
          .filter((row) => row.accountId === account.id)
          .reduce((sum, row) => sum + row.amountCents, 0);

        expect(account.balanceCents).toBe(
          ACCOUNT_SEEDS[account.type].openingCents + moved,
        );
      }
    });

    it("keeps every account in the black", () => {
      for (const account of data.accounts) {
        expect(account.balanceCents).toBeGreaterThan(0);
      }
    });

    it("issues the six catalog cards against checking, oldest first", () => {
      expect(data.cards.map((card) => card.label)).toEqual(
        Object.values(CARD_SEEDS).map((card) => card.label),
      );
      const created = data.cards.map((card) =>
        (card.createdAt as Date).getTime(),
      );
      expect(created).toEqual([...created].sort((a, b) => a - b));
      expect(Math.max(...created)).toBeLessThan(NOW.getTime());
      for (const card of data.cards) {
        expect(card.accountId).toBe(accountId(data, "checking"));
        expect(card.workspaceId).toBe(WORKSPACE_ID);
      }
    });

    it("spreads card expiry dates over the next two to three years", () => {
      expect(data.cards.map((card) => [card.expMonth, card.expYear])).toEqual([
        [6, 2028],
        [8, 2029],
        [10, 2028],
        [12, 2029],
        [2, 2028],
        [4, 2029],
      ]);
    });

    it("creates the six catalog recipients, added at different times in the past", () => {
      expect(data.recipients.map((recipient) => recipient.name)).toEqual(
        Object.values(RECIPIENT_SEEDS).map((recipient) => recipient.name),
      );
      expect(
        data.recipients.map(
          (recipient) =>
            (today - (recipient.createdAt as Date).getTime()) / DAY_MS,
        ),
      ).toEqual([300, 260, 220, 180, 140, 100]);
    });
  });

  describe("ledger", () => {
    it("scopes every transaction to the workspace and one of its accounts", () => {
      const accountIds = new Set(data.accounts.map((account) => account.id));

      for (const row of data.transactions) {
        expect(row.workspaceId).toBe(WORKSPACE_ID);
        expect(accountIds.has(row.accountId)).toBe(true);
      }
    });

    it("covers one year of history and three weeks of scheduled payments", () => {
      const times = data.transactions.map((row) => when(row).getTime());

      expect(startOfDay(new Date(Math.min(...times)))).toBe(
        today - (HISTORY_DAYS - 1) * DAY_MS,
      );
      expect(Math.max(...times)).toBeLessThan(
        today + (SCHEDULE_DAYS + 1) * DAY_MS,
      );
    });

    it("is sorted oldest first", () => {
      const times = data.transactions.map((row) => when(row).getTime());

      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it("dates nothing that has settled or is pending after the clock", () => {
      for (const row of settled) {
        expect(when(row).getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    });

    it("stamps transactions during business hours, 08:00 to 18:00 UTC", () => {
      for (const row of data.transactions) {
        const minutes =
          when(row).getUTCHours() * 60 + when(row).getUTCMinutes();
        expect(minutes).toBeGreaterThanOrEqual(8 * 60);
        expect(minutes).toBeLessThanOrEqual(18 * 60);
      }
    });

    it("gives every transaction an ALD reference without look-alike characters", () => {
      for (const row of data.transactions) {
        expect(row.reference).toMatch(/^ALD-[A-HJ-NP-Z2-9]{8}$/);
      }
    });

    it("links card purchases to their card and saved payees to their recipient", () => {
      const cardIds = Object.fromEntries(
        data.cards.map((card) => [card.label, card.id]),
      );
      const recipientIds = Object.fromEntries(
        data.recipients.map((recipient) => [recipient.name, recipient.id]),
      );

      for (const row of named("Amazon Web Services")) {
        expect(row.cardId).toBe(cardIds["Cloud infrastructure"]);
        expect(row.recipientId).toBeNull();
      }
      for (const row of named("Pilot.com, Inc.")) {
        expect(row.recipientId).toBe(recipientIds["Pilot.com, Inc."]);
        expect(row.cardId).toBeNull();
      }
      for (const row of data.transactions) {
        expect(row.cardId != null).toBe(row.method === "card");
      }
    });
  });

  describe("statuses", () => {
    it("leaves card and ACH activity from yesterday and today pending, and posts everything else", () => {
      const past = data.transactions.filter(
        (row) => row.status !== "scheduled" && row.status !== "failed",
      );

      for (const row of past) {
        const settlesSlowly = row.method === "card" || row.method === "ach";
        const recent = startOfDay(when(row)) >= today - DAY_MS;
        expect(row.status).toBe(settlesSlowly && recent ? "pending" : "posted");
      }
      expect(past.some((row) => row.status === "pending")).toBe(true);
    });

    it("schedules only bills known in advance, all dated after today", () => {
      const scheduled = data.transactions.filter(
        (row) => row.status === "scheduled",
      );
      const schedulable = RULES.filter((rule) => rule.schedulable).map(
        (rule) => rule.description,
      );

      expect(scheduled.map((row) => row.description).sort()).toEqual([
        "Gusto Payroll",
        "Gusto Tax",
        "Justworks Health",
        "Vouch Insurance",
        "WeWork · 600 Congress Ave",
      ]);
      for (const row of scheduled) {
        expect(schedulable).toContain(row.description);
        expect(startOfDay(when(row))).toBeGreaterThan(today);
        expect(row.amountCents).toBeLessThan(0);
      }
    });

    it("dates every unscheduled transaction today or earlier", () => {
      for (const row of data.transactions) {
        if (row.status === "scheduled") continue;
        expect(startOfDay(when(row))).toBeLessThanOrEqual(today);
      }
    });

    it("includes exactly one failed payment, which never touched the balance", () => {
      const failed = data.transactions.filter((row) => row.status === "failed");

      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        description: "Hartwell Staffing",
        amountCents: -420_000,
        category: "services",
        method: "ach",
        accountId: accountId(data, "checking"),
        recipientId: data.recipients.find(
          (recipient) => recipient.name === "Hartwell Staffing",
        )!.id,
        note: "Returned by receiving bank (R03: no account, unable to locate).",
      });
      expect(startOfDay(when(failed[0]))).toBe(today - 23 * DAY_MS);
    });
  });

  describe("amounts", () => {
    it("never records a zero amount", () => {
      for (const row of data.transactions) expect(row.amountCents).not.toBe(0);
    });

    it("charges fixed-price subscriptions and contracts the same round amount every time", () => {
      expect(new Set(named("Slack").map((row) => row.amountCents))).toEqual(
        new Set([-131_200]),
      );
      expect(named("Slack")).toHaveLength(12);
      expect(
        new Set(named("Northgate Health").map((row) => row.amountCents)),
      ).toEqual(new Set([3_200_000]));
    });

    it("keeps variable amounts inside the rule's dollar range", () => {
      for (const row of named("Vercel")) {
        expect(-row.amountCents).toBeGreaterThanOrEqual(640_00);
        expect(-row.amountCents).toBeLessThanOrEqual(980_00);
      }
    });

    it("grows payroll over the year as the company hires", () => {
      const payroll = named("Gusto Payroll").filter(
        (row) => row.status !== "scheduled",
      );
      const first = -payroll[0].amountCents;
      const last = -payroll.at(-1)!.amountCents;

      // 85% of the range a year ago, 100% of it today.
      expect(first).toBeGreaterThanOrEqual(74_000_00 * 0.85);
      expect(first).toBeLessThanOrEqual(79_000_00 * 0.86);
      expect(last).toBeGreaterThanOrEqual(74_000_00 * 0.99);
      expect(last).toBeLessThanOrEqual(79_000_00);
    });

    it("scales Stripe payouts from 70% of the range a year ago to all of it today", () => {
      const stripe = named("Stripe");
      const first = stripe[0].amountCents;
      const last = stripe.at(-1)!.amountCents;

      expect(first).toBeGreaterThanOrEqual(6_500_00 * 0.7);
      expect(first).toBeLessThanOrEqual(13_500_00 * 0.71);
      expect(last).toBeGreaterThanOrEqual(6_500_00 * 0.99);
      expect(last).toBeLessThanOrEqual(13_500_00);
    });

    it("signs up Meridian Freight part-way through the year", () => {
      const meridian = named("Meridian Freight");

      expect(meridian).toHaveLength(7);
      expect(when(meridian[0]).toISOString().slice(0, 10)).toBe("2025-11-22");
      for (const row of meridian) expect(row.amountCents).toBe(1_875_000);
    });
  });

  describe("treasury sweep and interest", () => {
    it("moves $60,000 from treasury to checking on the 5th as two matching legs", () => {
      const out = data.transactions.filter(
        (row) => row.description === "Transfer to Operating Checking",
      );
      const into = data.transactions.filter(
        (row) => row.description === "Transfer from Treasury",
      );

      expect(out).toHaveLength(12);
      expect(into).toHaveLength(12);
      out.forEach((leg, index) => {
        const match = into[index];
        expect(when(leg).getUTCDate()).toBe(5);
        expect(leg).toMatchObject({
          accountId: accountId(data, "treasury"),
          counterpartyAccountId: accountId(data, "checking"),
          amountCents: -6_000_000,
          category: "transfer",
          method: "transfer",
          status: "posted",
        });
        expect(match).toMatchObject({
          accountId: accountId(data, "checking"),
          counterpartyAccountId: accountId(data, "treasury"),
          amountCents: 6_000_000,
          category: "transfer",
          method: "transfer",
          status: "posted",
        });
        expect(when(match)).toEqual(when(leg));
      });
    });

    it("pays interest at month end to interest-bearing accounts only", () => {
      const interest = data.transactions.filter(
        (row) => row.category === "interest",
      );

      expect(interest).toHaveLength(24);
      for (const row of interest) {
        expect(isLastDayOfMonth(when(row))).toBe(true);
        expect(row.accountId).not.toBe(accountId(data, "checking"));
        expect(row).toMatchObject({
          description: "Interest earned",
          method: "interest",
          status: "posted",
        });
        expect(row.amountCents).toBeGreaterThan(0);
      }
    });

    it("compounds savings interest monthly at one twelfth of the APY", () => {
      const savingsInterest = data.transactions
        .filter(
          (row) =>
            row.category === "interest" &&
            row.accountId === accountId(data, "savings"),
        )
        .map((row) => row.amountCents);

      // Nothing else touches savings, so the whole series can be recomputed:
      // $600,000 at 3.90% is $1,950.00 in the first month, then it compounds.
      let balance = 600_000_00;
      const expected = savingsInterest.map(() => {
        const paid = Math.round((balance * 390) / 10_000 / 12);
        balance += paid;
        return paid;
      });

      expect(savingsInterest[0]).toBe(1_950_00);
      expect(savingsInterest).toEqual(expected);
      expect(
        data.accounts.find((account) => account.type === "savings")!
          .balanceCents,
      ).toBe(balance);
    });
  });

  describe("clock edge cases", () => {
    it("pulls today's activity back to just before the clock early in the morning", () => {
      // A Monday payday and tax day, half an hour into the business day.
      const now = new Date("2026-06-15T08:30:00.000Z");
      const early = build(now);
      const todays = early.transactions.filter(
        (row) => startOfDay(when(row)) === startOfDay(now),
      );

      expect(todays.map((row) => row.description)).toEqual(
        expect.arrayContaining(["Stripe", "Gusto Payroll", "IRS USATAXPYMT"]),
      );
      for (const row of todays) {
        expect(when(row).getTime()).toBeLessThanOrEqual(now.getTime());
        expect(when(row).getTime()).toBeGreaterThanOrEqual(
          now.getTime() - 90 * 60_000,
        );
        expect(row.status).toBe("pending");
      }
    });

    it("posts a treasury sweep made today immediately, because transfers settle at once", () => {
      const now = new Date("2026-06-05T16:30:00.000Z");
      const sweepDay = build(now);
      const legs = sweepDay.transactions.filter(
        (row) =>
          row.category === "transfer" &&
          startOfDay(when(row)) === startOfDay(now),
      );

      expect(legs.map((row) => row.amountCents).sort()).toEqual([
        -6_000_000, 6_000_000,
      ]);
      for (const leg of legs) {
        expect(leg.status).toBe("posted");
        expect(when(leg).getTime()).toBeLessThanOrEqual(now.getTime());
      }
    });

    it("posts interest paid today when the clock is on the last day of a month", () => {
      const now = new Date("2026-06-30T16:30:00.000Z");
      const monthEnd = build(now);
      const todays = monthEnd.transactions.filter(
        (row) =>
          row.category === "interest" &&
          startOfDay(when(row)) === startOfDay(now),
      );

      expect(todays).toHaveLength(2);
      for (const row of todays) expect(row.status).toBe("posted");
    });
  });
});
