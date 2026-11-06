// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../../test/db";
import {
  apiRequest,
  errorOf,
  segment,
  UNKNOWN_ID,
  setupSeededRouteDb,
} from "../../../../../../test/server-http";
import type { AccountDto } from "@/lib/contracts";
import { listAccounts } from "@/server/services/accounts";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let accounts: AccountDto[];

const get = (id: string, workspaceId: string | null = WORKSPACE_ID) =>
  GET(
    apiRequest(`/api/accounts/${id}/numbers`, { workspaceId }),
    segment({ id }),
  );

beforeAll(async () => {
  accounts = await listAccounts(context.db, WORKSPACE_ID);
});

describe("GET /api/accounts/:id/numbers", () => {
  it("reveals the full account and routing numbers", async () => {
    const response = await get(accounts[0].id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accountNumber: "202418874821",
      routingNumber: "114924742",
    });
  });

  it("returns each account's own number", async () => {
    const numbers = await Promise.all(
      accounts.map(async (account) => (await get(account.id)).json()),
    );

    expect(numbers.map((entry) => entry.accountNumber)).toEqual([
      "202418874821",
      "202418877730",
      "202418871094",
    ]);
    numbers.forEach((entry, index) => {
      expect(entry.accountNumber.slice(-4)).toBe(accounts[index].last4);
    });
  });

  it("forbids caches from storing the response", async () => {
    const response = await get(accounts[0].id);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["an unknown id", UNKNOWN_ID],
    ["a malformed id", "1; drop table accounts"],
  ])("answers 404 for %s", async (_label, id) => {
    const response = await get(id);

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Account was not found.",
    });
  });

  it("does not reveal another workspace's numbers", async () => {
    const response = await get(accounts[0].id, OTHER_WORKSPACE_ID);
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(text).not.toContain("202418874821");
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await get(accounts[0].id, null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
