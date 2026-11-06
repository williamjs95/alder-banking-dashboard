// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../test/server-http";
import type { AccountDto } from "@/lib/contracts";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

setupSeededRouteDb();

describe("GET /api/accounts", () => {
  it("lists the workspace's three accounts in display order", async () => {
    const response = await GET(apiRequest("/api/accounts"), noParams);
    const accounts = (await response.json()) as AccountDto[];

    expect(response.status).toBe(200);
    expect(
      accounts.map((account) => [
        account.name,
        account.type,
        account.last4,
        account.apyBps,
      ]),
    ).toEqual([
      ["Operating Checking", "checking", "4821", 0],
      ["Savings Reserve", "savings", "7730", 390],
      ["Treasury", "treasury", "1094", 460],
    ]);
    for (const account of accounts) {
      expect(Number.isInteger(account.balanceCents)).toBe(true);
      expect(account.balanceCents).toBeGreaterThan(0);
    }
  });

  it("never includes full account or routing numbers", async () => {
    const response = await GET(apiRequest("/api/accounts"), noParams);
    const text = await response.text();

    expect(Object.keys(JSON.parse(text)[0]).sort()).toEqual([
      "apyBps",
      "balanceCents",
      "id",
      "last4",
      "name",
      "type",
    ]);
    expect(text).not.toContain("202418874821");
    expect(text).not.toContain("114924742");
  });

  it("gives a different visitor their own accounts", async () => {
    const mine = (await (
      await GET(apiRequest("/api/accounts"), noParams)
    ).json()) as AccountDto[];
    const theirs = (await (
      await GET(
        apiRequest("/api/accounts", { workspaceId: OTHER_WORKSPACE_ID }),
        noParams,
      )
    ).json()) as AccountDto[];

    expect(theirs).toHaveLength(3);
    for (const account of theirs) {
      expect(mine.map((own) => own.id)).not.toContain(account.id);
    }
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await GET(
      apiRequest("/api/accounts", { workspaceId: null }),
      noParams,
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
