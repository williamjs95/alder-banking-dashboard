// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import {
  addAccount,
  addTransaction,
  addWorkspace,
  seedLedger,
  seedNeighbour,
  utc,
  type Ledger,
} from "../../../test/server-ledger";
import type { OverviewDto } from "@/lib/contracts";
import type { Db } from "@/server/db/client";
import { getOverview } from "./overview";

// See test/server-ledger.ts for the rows these figures are derived from.
let db: Db;
let ledger: Ledger;
let overview: OverviewDto;

beforeAll(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
  await seedNeighbour(db, OTHER_WORKSPACE_ID);
  overview = await getOverview(db, WORKSPACE_ID, NOW);
});

describe("getOverview", () => {
  it("adds up the balance of every account", () => {
    expect(overview.totalBalanceCents).toBe(15_000_000);
    expect(overview.accounts).toEqual([
      {
        id: ledger.checking.id,
        name: "Checking",
        type: "checking",
        last4: "4821",
        balanceCents: 10_000_000,
        apyBps: 0,
      },
      {
        id: ledger.savings.id,
        name: "Savings",
        type: "savings",
        last4: "7730",
        balanceCents: 5_000_000,
        apyBps: 390,
      },
    ]);
  });

  it("charts a year of total balance that ends at today's total", () => {
    expect(overview.balanceSeries).toHaveLength(365);
    expect(overview.balanceSeries[0]).toEqual({
      date: "2025-06-19",
      balanceCents: 15_000_000 - 148_000,
    });
    expect(overview.balanceSeries.slice(-2)).toEqual([
      { date: "2026-06-17", balanceCents: 14_962_000 },
      { date: "2026-06-18", balanceCents: 15_000_000 },
    ]);
  });

  it("compares the last 30 days of cash flow with the 30 days before", () => {
    expect(overview.last30Days).toEqual({
      inflowCents: 90_000,
      outflowCents: 52_000,
    });
    expect(overview.previous30Days).toEqual({
      inflowCents: 0,
      outflowCents: 20_000,
    });
  });

  it("reports twelve months of cash flow, oldest first", () => {
    expect(overview.cashflow).toHaveLength(12);
    expect(overview.cashflow[0]).toEqual({
      month: "2025-07",
      inflowCents: 0,
      outflowCents: 0,
      netCents: 0,
    });
    expect(overview.cashflow.slice(-4)).toEqual([
      {
        month: "2026-03",
        inflowCents: 0,
        outflowCents: 70_000,
        netCents: -70_000,
      },
      { month: "2026-04", inflowCents: 0, outflowCents: 0, netCents: 0 },
      {
        month: "2026-05",
        inflowCents: 40_000,
        outflowCents: 44_000,
        netCents: -4_000,
      },
      {
        month: "2026-06",
        inflowCents: 50_000,
        outflowCents: 28_000,
        netCents: 22_000,
      },
    ]);
  });

  it("breaks the last 30 days of spend down by category", () => {
    expect(overview.spendByCategory).toEqual([
      { category: "cloud", cents: 32_000 },
      { category: "software", cents: 20_000 },
    ]);
  });

  it("derives burn from the last three full months and runway from the total balance", () => {
    // March -70,000, April 0, May -4,000: an average burn of 24,667 cents.
    expect(overview.monthlyBurnCents).toBe(24_667);
    // $150,000.00 / $246.67 a month.
    expect(overview.runwayMonths).toBe(608.1);
  });

  it("shows the seven latest transactions, newest first, without scheduled ones", () => {
    const names = overview.recent.map((row) => row.description);

    expect(names).toHaveLength(7);
    expect(names.slice(0, 3)).toEqual([
      "Stripe",
      "Amazon Web Services",
      "Slack",
    ]);
    expect(names.slice(3, 5).sort()).toEqual([
      "Transfer from Checking",
      "Transfer to Savings",
    ]);
    expect(names.slice(5)).toEqual(["Hartwell Staffing", "Notion"]);
  });

  it("lists upcoming scheduled payments", () => {
    expect(
      overview.upcoming.map((row) => [
        row.description,
        row.status,
        row.postedAt,
      ]),
    ).toEqual([["Gusto Payroll", "scheduled", "2026-06-25T15:00:00.000Z"]]);
  });

  it("limits upcoming payments to the next five", async () => {
    const workspaceId = randomUUID();
    await addWorkspace(db, workspaceId);
    const account = await addAccount(db, workspaceId, {
      balanceCents: 1_000_00,
    });
    for (let day = 20; day <= 27; day++) {
      await addTransaction(db, account, {
        postedAt: utc(`2026-06-${day}T15:00:00`),
        amountCents: -1_000,
        description: `Bill due on the ${day}th`,
        status: "scheduled",
      });
    }

    const { upcoming, recent } = await getOverview(db, workspaceId, NOW);

    expect(upcoming.map((row) => row.description)).toEqual([
      "Bill due on the 20th",
      "Bill due on the 21th",
      "Bill due on the 22th",
      "Bill due on the 23th",
      "Bill due on the 24th",
    ]);
    expect(recent).toEqual([]);
  });

  it("reports no runway for a company that is making money", async () => {
    const workspaceId = randomUUID();
    await addWorkspace(db, workspaceId);
    const account = await addAccount(db, workspaceId, {
      balanceCents: 900_000,
    });
    for (const month of ["03", "04", "05"]) {
      await addTransaction(db, account, {
        postedAt: utc(`2026-${month}-10T12:00:00`),
        amountCents: 300_000,
        description: "Customer payment",
        category: "revenue",
      });
    }

    const profitable = await getOverview(db, workspaceId, NOW);

    expect(profitable.monthlyBurnCents).toBe(-300_000);
    expect(profitable.runwayMonths).toBeNull();
    expect(profitable.totalBalanceCents).toBe(900_000);
  });

  it("shows another workspace only its own money", async () => {
    const theirs = await getOverview(db, OTHER_WORKSPACE_ID, NOW);

    expect(theirs.totalBalanceCents).toBe(900_000_000);
    expect(theirs.accounts.map((account) => account.name)).toEqual([
      "Neighbour Checking",
    ]);
    expect(theirs.last30Days).toEqual({
      inflowCents: 0,
      outflowCents: 777_700,
    });
    expect(theirs.recent.map((row) => row.description)).toEqual([
      "Neighbour Cloud",
    ]);
    expect(theirs.upcoming).toEqual([]);
    expect(theirs.runwayMonths).toBeNull();
  });
});
