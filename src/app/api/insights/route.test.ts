// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NOW, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../test/server-http";
import type { InsightsDto } from "@/lib/contracts";
import { getInsights } from "@/server/services/insights";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();

const get = async () =>
  (await (
    await GET(apiRequest("/api/insights"), noParams)
  ).json()) as InsightsDto;

describe("GET /api/insights", () => {
  it("answers 200 with the workspace's insights as of now", async () => {
    const response = await GET(apiRequest("/api/insights"), noParams);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      await getInsights(context.db, WORKSPACE_ID, NOW),
    );
  });

  it("trends the last six months of spend, ending with the current month", async () => {
    const { categoryTrend, trendCategories } = await get();

    expect(categoryTrend.map((month) => month.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    // Payroll is the demo company's largest cost by a wide margin.
    expect(trendCategories[0]).toBe("payroll");
    expect(trendCategories).not.toContain("revenue");
    expect(trendCategories).not.toContain("transfer");
    // Two paydays in each full month; only the 15th has happened in June.
    for (const month of categoryTrend.slice(0, 5)) {
      expect(month.totals.payroll).toBeGreaterThan(2 * 62_900_00);
    }
    expect(categoryTrend[5].totals.payroll).toBeGreaterThan(62_900_00);
    expect(categoryTrend[5].totals.payroll).toBeLessThan(79_000_00);
  });

  it("ranks at most eight merchants, biggest first", async () => {
    const { topMerchants } = await get();
    const cents = topMerchants.map((merchant) => merchant.cents);

    expect(topMerchants).toHaveLength(8);
    expect(topMerchants[0].description).toBe("Gusto Payroll");
    expect(cents).toEqual([...cents].sort((a, b) => b - a));
  });

  it("reports the largest expense of the last 30 days as a real outgoing transaction", async () => {
    const {
      largestExpense,
      averageMonthlySpendCents,
      averageMonthlyRevenueCents,
    } = await get();

    expect(largestExpense).toMatchObject({ description: "Gusto Payroll" });
    expect(largestExpense!.amountCents).toBeLessThan(-70_000_00);
    expect(averageMonthlySpendCents).toBeGreaterThan(0);
    expect(averageMonthlyRevenueCents).toBeGreaterThan(0);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await GET(
      apiRequest("/api/insights", { workspaceId: null }),
      noParams,
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
