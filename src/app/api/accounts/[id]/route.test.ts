// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NOW, OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../test/db";
import {
  apiRequest,
  errorOf,
  segment,
  UNKNOWN_ID,
  setupSeededRouteDb,
} from "../../../../../test/server-http";
import { ledgerRows } from "../../../../../test/server-ledger";
import type { AccountDetailDto, AccountDto } from "@/lib/contracts";
import { addDays } from "@/lib/dates";
import { listAccounts } from "@/server/services/accounts";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let treasury: AccountDto;

const get = (id: string, workspaceId: string | null = WORKSPACE_ID) =>
  GET(apiRequest(`/api/accounts/${id}`, { workspaceId }), segment({ id }));

beforeAll(async () => {
  treasury = (await listAccounts(context.db, WORKSPACE_ID))[2];
});

describe("GET /api/accounts/:id", () => {
  it("returns the account with a year of daily balances ending today", async () => {
    const response = await get(treasury.id);
    const detail = (await response.json()) as AccountDetailDto;

    expect(response.status).toBe(200);
    expect(detail.account).toEqual(treasury);
    expect(detail.account.name).toBe("Treasury");
    expect(detail.balanceSeries).toHaveLength(365);
    expect(detail.balanceSeries[0].date).toBe("2025-06-19");
    expect(detail.balanceSeries.at(-1)).toEqual({
      date: "2026-06-18",
      balanceCents: treasury.balanceCents,
    });
  });

  it("totals the account's last 30 days from its own ledger rows", async () => {
    const detail = (await (await get(treasury.id)).json()) as AccountDetailDto;
    const since = addDays(NOW, -30).getTime();
    const recent = (await ledgerRows(context.db, WORKSPACE_ID)).filter(
      (row) =>
        row.accountId === treasury.id &&
        row.status === "posted" &&
        row.postedAt.getTime() >= since &&
        row.postedAt.getTime() < NOW.getTime(),
    );

    // The $60,000 sweep to checking on the 5th and the month-end interest.
    expect(recent.map((row) => row.description).sort()).toEqual([
      "Interest earned",
      "Transfer to Operating Checking",
    ]);
    expect(detail.last30Days).toEqual({
      inflowCents: recent.find((row) => row.amountCents > 0)!.amountCents,
      outflowCents: 6_000_000,
    });
  });

  it("walks the balance back by exactly the sweep on the day it happened", async () => {
    const { balanceSeries } = (await (
      await get(treasury.id)
    ).json()) as AccountDetailDto;
    const on = (date: string) =>
      balanceSeries.find((point) => point.date === date)!.balanceCents;

    expect(on("2026-06-04") - on("2026-06-05")).toBe(6_000_000);
    expect(on("2026-06-05")).toBe(treasury.balanceCents);
  });

  it.each([
    ["an unknown id", UNKNOWN_ID],
    ["a malformed id", "not-a-uuid"],
  ])("answers 404 for %s", async (_label, id) => {
    const response = await get(id);

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Account was not found.",
    });
  });

  it("answers 404 when the account belongs to another workspace", async () => {
    const response = await get(treasury.id, OTHER_WORKSPACE_ID);

    expect(response.status).toBe(404);
    expect((await errorOf(response)).code).toBe("not_found");
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await get(treasury.id, null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
