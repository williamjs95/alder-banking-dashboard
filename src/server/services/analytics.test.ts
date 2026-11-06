// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  seedLedger,
  seedNeighbour,
  utc,
  type Ledger,
} from "../../../test/server-ledger";
import { addDays } from "@/lib/dates";
import type { CashflowMonth } from "@/lib/contracts";
import type { Db } from "@/server/db/client";
import {
  getBalanceSeries,
  getFlowTotals,
  getMonthlyCashflow,
  getSpendByCategory,
  getSpendByMonthAndCategory,
  getTopMerchants,
  monthlyBurn,
  runwayMonths,
} from "./analytics";

// See test/server-ledger.ts for the rows these figures are derived from.
let db: Db;
let ledger: Ledger;

const thirtyDaysAgo = addDays(NOW, -30);
const sixtyDaysAgo = addDays(NOW, -60);
const TOTAL_BALANCE = 150_000_00;

beforeAll(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
  await seedNeighbour(db, OTHER_WORKSPACE_ID);
});

describe("getBalanceSeries", () => {
  it("walks back from today's balance through each day's net movement", async () => {
    const series = await getBalanceSeries(
      db,
      WORKSPACE_ID,
      TOTAL_BALANCE,
      NOW,
      5,
    );

    expect(series).toEqual([
      // Jun 14 and 15: nothing settled (the failed payment moved no money).
      { date: "2026-06-14", balanceCents: 14_970_000 },
      { date: "2026-06-15", balanceCents: 14_970_000 },
      // Jun 16: the internal transfer nets to zero across the company.
      { date: "2026-06-16", balanceCents: 14_970_000 },
      // Jun 17: Slack -8,000 at 23:59:59 UTC.
      { date: "2026-06-17", balanceCents: 14_962_000 },
      // Jun 18: Stripe +50,000 and pending AWS -12,000 at 00:00:00 UTC.
      { date: "2026-06-18", balanceCents: 15_000_000 },
    ]);
  });

  it("counts an internal transfer as a real movement for a single account", async () => {
    const checking = await getBalanceSeries(
      db,
      WORKSPACE_ID,
      ledger.checking.balanceCents,
      NOW,
      5,
      ledger.checking.id,
    );
    const savings = await getBalanceSeries(
      db,
      WORKSPACE_ID,
      ledger.savings.balanceCents,
      NOW,
      4,
      ledger.savings.id,
    );

    expect(checking.map((point) => point.balanceCents)).toEqual([
      10_070_000, 10_070_000, 9_970_000, 9_962_000, 10_000_000,
    ]);
    expect(savings).toEqual([
      { date: "2026-06-15", balanceCents: 4_900_000 },
      { date: "2026-06-16", balanceCents: 5_000_000 },
      { date: "2026-06-17", balanceCents: 5_000_000 },
      { date: "2026-06-18", balanceCents: 5_000_000 },
    ]);
  });

  it("returns one point per day, oldest first, ending today", async () => {
    const series = await getBalanceSeries(
      db,
      WORKSPACE_ID,
      TOTAL_BALANCE,
      NOW,
      365,
    );

    expect(series).toHaveLength(365);
    expect(series[0].date).toBe("2025-06-19");
    expect(series.at(-1)).toEqual({
      date: "2026-06-18",
      balanceCents: TOTAL_BALANCE,
    });
    expect(series.map((point) => point.date)).toEqual(
      series.map((point) => point.date).sort(),
    );
    // A year ago: today's balance minus every settled movement since (+148,000).
    expect(series[0].balanceCents).toBe(TOTAL_BALANCE - 148_000);
  });

  it("returns just today's balance for a one-day window", async () => {
    expect(
      await getBalanceSeries(db, WORKSPACE_ID, TOTAL_BALANCE, NOW, 1),
    ).toEqual([{ date: "2026-06-18", balanceCents: TOTAL_BALANCE }]);
  });

  it("is a flat line for an account with no activity", async () => {
    const series = await getBalanceSeries(
      db,
      WORKSPACE_ID,
      1_234,
      NOW,
      3,
      UNKNOWN_ID,
    );

    expect(series.map((point) => point.balanceCents)).toEqual([
      1_234, 1_234, 1_234,
    ]);
  });
});

describe("getFlowTotals", () => {
  it("sums money in and out over the last 30 days, leaving out transfers, failed and scheduled rows", async () => {
    // In: Stripe 50,000 + Stripe 40,000 (dated exactly 30 days ago).
    // Out: AWS 12,000 + Slack 8,000 + Notion 8,000 + Figma 4,000 + AWS 20,000.
    expect(await getFlowTotals(db, WORKSPACE_ID, thirtyDaysAgo, NOW)).toEqual({
      inflowCents: 90_000,
      outflowCents: 52_000,
    });
  });

  it("includes a row dated exactly at the start and excludes one dated exactly at the end", async () => {
    const from = ledger.tx.stripeMay.postedAt;
    const until = ledger.tx.stripeToday.postedAt;

    expect(await getFlowTotals(db, WORKSPACE_ID, from, until)).toEqual({
      inflowCents: 40_000,
      outflowCents: 52_000,
    });
  });

  it("covers the previous 30-day window without overlapping the current one", async () => {
    // Google Ads 15,000 + Vercel 5,000.
    expect(
      await getFlowTotals(db, WORKSPACE_ID, sixtyDaysAgo, thirtyDaysAgo),
    ).toEqual({ inflowCents: 0, outflowCents: 20_000 });
  });

  it("counts transfers when asked about one account", async () => {
    expect(
      await getFlowTotals(
        db,
        WORKSPACE_ID,
        thirtyDaysAgo,
        NOW,
        ledger.checking.id,
      ),
    ).toEqual({ inflowCents: 90_000, outflowCents: 152_000 });
    expect(
      await getFlowTotals(
        db,
        WORKSPACE_ID,
        thirtyDaysAgo,
        NOW,
        ledger.savings.id,
      ),
    ).toEqual({ inflowCents: 100_000, outflowCents: 0 });
  });

  it("returns zeros, not nulls, when nothing happened in the window", async () => {
    expect(
      await getFlowTotals(
        db,
        WORKSPACE_ID,
        utc("2020-01-01T00:00:00"),
        utc("2020-02-01T00:00:00"),
      ),
    ).toEqual({ inflowCents: 0, outflowCents: 0 });
  });

  it("cannot see another workspace's account", async () => {
    expect(
      await getFlowTotals(
        db,
        OTHER_WORKSPACE_ID,
        thirtyDaysAgo,
        NOW,
        ledger.checking.id,
      ),
    ).toEqual({ inflowCents: 0, outflowCents: 0 });
  });
});

describe("getMonthlyCashflow", () => {
  it("reports each calendar month oldest first, filling quiet months with zeros", async () => {
    expect(await getMonthlyCashflow(db, WORKSPACE_ID, NOW, 5)).toEqual([
      {
        month: "2026-02",
        inflowCents: 200_000,
        outflowCents: 0,
        netCents: 200_000,
      },
      {
        month: "2026-03",
        inflowCents: 0,
        outflowCents: 70_000,
        netCents: -70_000,
      },
      { month: "2026-04", inflowCents: 0, outflowCents: 0, netCents: 0 },
      // May: Figma at 23:59:59 on the 31st belongs here, not in June.
      {
        month: "2026-05",
        inflowCents: 40_000,
        outflowCents: 44_000,
        netCents: -4_000,
      },
      // June: Notion at 00:00:00 on the 1st belongs here.
      {
        month: "2026-06",
        inflowCents: 50_000,
        outflowCents: 28_000,
        netCents: 22_000,
      },
    ]);
  });

  it("ignores history older than the requested months", async () => {
    expect(await getMonthlyCashflow(db, WORKSPACE_ID, NOW, 1)).toEqual([
      {
        month: "2026-06",
        inflowCents: 50_000,
        outflowCents: 28_000,
        netCents: 22_000,
      },
    ]);
  });

  it("returns a full run of zero months for a workspace with no ledger", async () => {
    const months = await getMonthlyCashflow(db, UNKNOWN_ID, NOW, 12);

    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-07");
    expect(months.every((month) => month.netCents === 0)).toBe(true);
  });
});

describe("getSpendByCategory", () => {
  it("totals outgoing money per category, largest first", async () => {
    expect(
      await getSpendByCategory(db, WORKSPACE_ID, thirtyDaysAgo, NOW),
    ).toEqual([
      { category: "cloud", cents: 32_000 },
      { category: "software", cents: 20_000 },
    ]);
  });

  it("honours the window", async () => {
    expect(
      await getSpendByCategory(db, WORKSPACE_ID, sixtyDaysAgo, thirtyDaysAgo),
    ).toEqual([
      { category: "marketing", cents: 15_000 },
      { category: "cloud", cents: 5_000 },
    ]);
  });

  it("is empty when nothing was spent", async () => {
    expect(
      await getSpendByCategory(
        db,
        WORKSPACE_ID,
        utc("2026-04-01T00:00:00"),
        utc("2026-05-01T00:00:00"),
      ),
    ).toEqual([]);
  });
});

describe("getSpendByMonthAndCategory", () => {
  it("breaks spend down by calendar month and category", async () => {
    const rows = await getSpendByMonthAndCategory(
      db,
      WORKSPACE_ID,
      utc("2026-01-01T00:00:00"),
    );

    expect(rows).toHaveLength(6);
    expect(rows).toEqual(
      expect.arrayContaining([
        { month: "2026-03", category: "rent", cents: 70_000 },
        { month: "2026-05", category: "cloud", cents: 25_000 },
        { month: "2026-05", category: "marketing", cents: 15_000 },
        { month: "2026-05", category: "software", cents: 4_000 },
        { month: "2026-06", category: "cloud", cents: 12_000 },
        { month: "2026-06", category: "software", cents: 16_000 },
      ]),
    );
  });

  it("starts at the given instant", async () => {
    const rows = await getSpendByMonthAndCategory(
      db,
      WORKSPACE_ID,
      utc("2026-06-01T00:00:00"),
    );

    expect(rows.map((row) => row.month)).toEqual(["2026-06", "2026-06"]);
  });
});

describe("getTopMerchants", () => {
  const ninetyDaysAgo = addDays(NOW, -90);

  it("ranks payees by money received, breaking ties alphabetically", async () => {
    expect(
      await getTopMerchants(db, WORKSPACE_ID, ninetyDaysAgo, NOW, 8),
    ).toEqual([
      { description: "Amazon Web Services", cents: 32_000, count: 2 },
      { description: "Google Ads", cents: 15_000, count: 1 },
      { description: "Notion", cents: 8_000, count: 1 },
      { description: "Slack", cents: 8_000, count: 1 },
      { description: "Vercel", cents: 5_000, count: 1 },
      { description: "Figma", cents: 4_000, count: 1 },
    ]);
  });

  it("returns no more than the limit", async () => {
    const top = await getTopMerchants(db, WORKSPACE_ID, ninetyDaysAgo, NOW, 3);

    expect(top.map((merchant) => merchant.description)).toEqual([
      "Amazon Web Services",
      "Google Ads",
      "Notion",
    ]);
  });

  it("never lists customers, transfers, failed or scheduled payments", async () => {
    const names = (
      await getTopMerchants(
        db,
        WORKSPACE_ID,
        utc("2026-01-01T00:00:00"),
        addDays(NOW, 30),
        50,
      )
    ).map((merchant) => merchant.description);

    expect(names).toContain("WeWork");
    for (const excluded of [
      "Stripe",
      "Northgate Health",
      "Transfer to Savings",
      "Hartwell Staffing",
      "Gusto Payroll",
    ]) {
      expect(names).not.toContain(excluded);
    }
  });
});

describe("workspace isolation", () => {
  it("keeps the neighbour's $7,777 cloud bill out of every figure", async () => {
    const spend = await getSpendByCategory(
      db,
      WORKSPACE_ID,
      thirtyDaysAgo,
      NOW,
    );
    const merchants = await getTopMerchants(
      db,
      WORKSPACE_ID,
      thirtyDaysAgo,
      NOW,
      50,
    );

    expect(spend.find((row) => row.category === "cloud")?.cents).toBe(32_000);
    expect(merchants.map((merchant) => merchant.description)).not.toContain(
      "Neighbour Cloud",
    );
  });

  it("shows the neighbour only their own ledger", async () => {
    expect(
      await getFlowTotals(db, OTHER_WORKSPACE_ID, thirtyDaysAgo, NOW),
    ).toEqual({ inflowCents: 0, outflowCents: 777_700 });
    expect(
      await getTopMerchants(db, OTHER_WORKSPACE_ID, thirtyDaysAgo, NOW, 50),
    ).toEqual([{ description: "Neighbour Cloud", cents: 777_700, count: 1 }]);
    expect(
      (await getMonthlyCashflow(db, OTHER_WORKSPACE_ID, NOW, 1))[0],
    ).toMatchObject({ outflowCents: 777_700 });
  });
});

describe("monthlyBurn", () => {
  const month = (name: string, netCents: number): CashflowMonth => ({
    month: name,
    inflowCents: Math.max(netCents, 0),
    outflowCents: Math.max(-netCents, 0),
    netCents,
  });

  it("averages the net outflow of the last three full months, ignoring the current one", () => {
    const cashflow = [
      month("2026-01", -900_000),
      month("2026-02", -30_000),
      month("2026-03", -60_000),
      month("2026-04", -90_000),
      month("2026-05", 5_000_000),
    ];

    expect(monthlyBurn(cashflow)).toBe(60_000);
  });

  it("is negative when the company is making money", () => {
    expect(
      monthlyBurn([month("a", 10_000), month("b", 20_000), month("now", -1)]),
    ).toBe(-15_000);
  });

  it("uses however many full months exist when there are fewer than three", () => {
    expect(monthlyBurn([month("a", -40_000), month("now", 0)])).toBe(40_000);
  });

  it("rounds to whole cents", () => {
    expect(
      monthlyBurn([
        month("a", -1),
        month("b", 0),
        month("c", 0),
        month("now", 0),
      ]),
    ).toBe(0);
    expect(
      monthlyBurn([
        month("a", -2),
        month("b", 0),
        month("c", 0),
        month("now", 0),
      ]),
    ).toBe(1);
  });

  it("is zero when there is no full month to look at", () => {
    expect(monthlyBurn([month("now", -50_000)])).toBe(0);
    expect(monthlyBurn([])).toBe(0);
  });
});

describe("runwayMonths", () => {
  it("divides cash by burn, to one decimal place", () => {
    expect(runwayMonths(1_000_000, 300_000)).toBe(3.3);
    expect(runwayMonths(1_200_000, 100_000)).toBe(12);
  });

  it("is zero when there is no cash left", () => {
    expect(runwayMonths(0, 100_000)).toBe(0);
  });

  it("is null when the company is not burning cash", () => {
    expect(runwayMonths(1_000_000, 0)).toBeNull();
    expect(runwayMonths(1_000_000, -50_000)).toBeNull();
  });
});
