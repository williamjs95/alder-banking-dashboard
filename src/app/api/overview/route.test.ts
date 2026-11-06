// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NOW, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../test/server-http";
import { ledgerRows } from "../../../../test/server-ledger";
import type { OverviewDto } from "@/lib/contracts";
import { getOverview } from "@/server/services/overview";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();

const get = async () =>
  (await (
    await GET(apiRequest("/api/overview"), noParams)
  ).json()) as OverviewDto;

describe("GET /api/overview", () => {
  it("answers 200 with the workspace's overview as of now", async () => {
    const response = await GET(apiRequest("/api/overview"), noParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      await getOverview(context.db, WORKSPACE_ID, NOW),
    );
  });

  it("totals the three account balances", async () => {
    const overview = await get();

    expect(overview.accounts.map((account) => account.name)).toEqual([
      "Operating Checking",
      "Savings Reserve",
      "Treasury",
    ]);
    expect(overview.totalBalanceCents).toBe(
      overview.accounts.reduce((sum, account) => sum + account.balanceCents, 0),
    );
  });

  it("charts a year of balances ending at today's total and twelve months of cash flow", async () => {
    const overview = await get();

    expect(overview.balanceSeries).toHaveLength(365);
    expect(overview.balanceSeries.at(-1)).toEqual({
      date: "2026-06-18",
      balanceCents: overview.totalBalanceCents,
    });
    expect(overview.cashflow).toHaveLength(12);
    expect(overview.cashflow[0].month).toBe("2025-07");
    expect(overview.cashflow.at(-1)!.month).toBe("2026-06");
    for (const month of overview.cashflow) {
      expect(month.netCents).toBe(month.inflowCents - month.outflowCents);
    }
  });

  it("opened the year with $2,520,000 across the three accounts", async () => {
    const { balanceSeries, totalBalanceCents } = await get();
    const settled = (await ledgerRows(context.db, WORKSPACE_ID)).filter(
      (row) => row.status === "posted" || row.status === "pending",
    );
    const firstDay = settled
      .filter((row) => row.postedAt.toISOString().startsWith("2025-06-19"))
      .reduce((sum, row) => sum + row.amountCents, 0);
    const moved = settled.reduce((sum, row) => sum + row.amountCents, 0);

    // Opening balances: 420,000 + 600,000 + 1,500,000 dollars.
    expect(totalBalanceCents - moved).toBe(2_520_000_00);
    expect(balanceSeries[0].balanceCents).toBe(2_520_000_00 + firstDay);
  });

  it("shows the seven latest transactions and the five next scheduled payments", async () => {
    const { recent, upcoming } = await get();

    expect(recent).toHaveLength(7);
    expect(recent.map((row) => row.postedAt)).toEqual(
      recent
        .map((row) => row.postedAt)
        .sort()
        .reverse(),
    );
    expect(recent.every((row) => row.status !== "scheduled")).toBe(true);
    expect(upcoming.map((row) => [row.description, row.status])).toEqual(
      expect.arrayContaining([
        ["Gusto Payroll", "scheduled"],
        ["Gusto Tax", "scheduled"],
        ["Justworks Health", "scheduled"],
        ["WeWork · 600 Congress Ave", "scheduled"],
        ["Vouch Insurance", "scheduled"],
      ]),
    );
    expect(upcoming).toHaveLength(5);
    expect(upcoming.at(-1)!.description).toBe("Vouch Insurance");
  });

  it("derives burn from the last three full months and runway from the total balance", async () => {
    const { cashflow, monthlyBurnCents, runwayMonths, totalBalanceCents } =
      await get();
    const [march, april, may] = cashflow.slice(-4, -1);

    // The demo company spends more than it earns, so it has a finite runway.
    expect(monthlyBurnCents).toBe(
      Math.round(-(march.netCents + april.netCents + may.netCents) / 3),
    );
    expect(monthlyBurnCents).toBeGreaterThan(0);
    expect(totalBalanceCents).toBe(178_239_628);
    expect(monthlyBurnCents).toBe(5_732_365);
    expect(runwayMonths).toBe(31.1);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await GET(
      apiRequest("/api/overview", { workspaceId: null }),
      noParams,
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
