// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createSeededDb,
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import {
  addWorkspace,
  seedLedger,
  seedNeighbour,
  type Ledger,
} from "../../../test/server-ledger";
import type { InsightsDto } from "@/lib/contracts";
import type { Db } from "@/server/db/client";
import { getInsights } from "./insights";

// See test/server-ledger.ts for the rows these figures are derived from.
let db: Db;
let ledger: Ledger;
let insights: InsightsDto;

beforeAll(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
  await seedNeighbour(db, OTHER_WORKSPACE_ID);
  insights = await getInsights(db, WORKSPACE_ID, NOW);
});

describe("getInsights", () => {
  it("trends spend by category over the last six months, with empty months kept", () => {
    expect(insights.categoryTrend).toEqual([
      { month: "2026-01", totals: {} },
      { month: "2026-02", totals: {} },
      { month: "2026-03", totals: { rent: 70_000 } },
      { month: "2026-04", totals: {} },
      {
        month: "2026-05",
        totals: { cloud: 25_000, marketing: 15_000, software: 4_000 },
      },
      { month: "2026-06", totals: { cloud: 12_000, software: 16_000 } },
    ]);
  });

  it("lists the trend's categories by total spend, largest first", () => {
    // rent 70,000; cloud 37,000; software 20,000; marketing 15,000.
    expect(insights.trendCategories).toEqual([
      "rent",
      "cloud",
      "software",
      "marketing",
    ]);
  });

  it("ranks the payees of the last 90 days", () => {
    expect(insights.topMerchants).toEqual([
      { description: "Amazon Web Services", cents: 32_000, count: 2 },
      { description: "Google Ads", cents: 15_000, count: 1 },
      { description: "Notion", cents: 8_000, count: 1 },
      { description: "Slack", cents: 8_000, count: 1 },
      { description: "Vercel", cents: 5_000, count: 1 },
      { description: "Figma", cents: 4_000, count: 1 },
    ]);
  });

  it("compares each category's last 30 days with the 30 days before", () => {
    expect(insights.categoryComparison).toEqual([
      // Spent in both periods.
      { category: "cloud", currentCents: 32_000, previousCents: 5_000 },
      // New this period.
      { category: "software", currentCents: 20_000, previousCents: 0 },
      // Spent last period only.
      { category: "marketing", currentCents: 0, previousCents: 15_000 },
    ]);
  });

  it("averages spend and revenue over the last three full months", () => {
    // Spend: March 70,000 + April 0 + May 44,000. Revenue: May 40,000 only.
    expect(insights.averageMonthlySpendCents).toBe(38_000);
    expect(insights.averageMonthlyRevenueCents).toBe(13_333);
  });

  it("highlights the largest expense of the last 30 days", () => {
    expect(insights.largestExpense).toMatchObject({
      id: ledger.tx.awsMay.id,
      description: "Amazon Web Services",
      amountCents: -20_000,
      postedAt: "2026-05-20T12:00:00.000Z",
    });
  });

  it("caps the merchant ranking at eight", async () => {
    // The seeded demo company pays far more than eight different merchants.
    const seeded = await getInsights(await createSeededDb(), WORKSPACE_ID, NOW);

    expect(seeded.topMerchants).toHaveLength(8);
    expect(seeded.topMerchants[0].description).toBe("Gusto Payroll");
    expect(seeded.topMerchants.map((merchant) => merchant.cents)).toEqual(
      seeded.topMerchants
        .map((merchant) => merchant.cents)
        .sort((a, b) => b - a),
    );
  });

  it("returns empty insights for a workspace with no history", async () => {
    const workspaceId = randomUUID();
    await addWorkspace(db, workspaceId);

    expect(await getInsights(db, workspaceId, NOW)).toEqual({
      categoryTrend: [
        { month: "2026-01", totals: {} },
        { month: "2026-02", totals: {} },
        { month: "2026-03", totals: {} },
        { month: "2026-04", totals: {} },
        { month: "2026-05", totals: {} },
        { month: "2026-06", totals: {} },
      ],
      trendCategories: [],
      topMerchants: [],
      categoryComparison: [],
      averageMonthlySpendCents: 0,
      averageMonthlyRevenueCents: 0,
      largestExpense: null,
    });
  });

  it("shows another workspace only its own spend", async () => {
    const theirs = await getInsights(db, OTHER_WORKSPACE_ID, NOW);

    expect(theirs.topMerchants).toEqual([
      { description: "Neighbour Cloud", cents: 777_700, count: 1 },
    ]);
    expect(theirs.categoryComparison).toEqual([
      { category: "cloud", currentCents: 777_700, previousCents: 0 },
    ]);
    expect(theirs.largestExpense?.description).toBe("Neighbour Cloud");
    expect(insights.largestExpense?.description).not.toBe("Neighbour Cloud");
  });
});
