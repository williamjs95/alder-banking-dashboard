// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../test/server-http";
import { ledgerRows } from "../../../../test/server-ledger";
import type { TransactionListDto } from "@/lib/contracts";
import type { TransactionRow } from "@/server/db/schema";
import { listAccounts } from "@/server/services/accounts";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
/** Every seeded row, read straight from the table, to check the API against. */
let rows: TransactionRow[];

const get = (query = "", workspaceId: string | null = WORKSPACE_ID) =>
  GET(apiRequest(`/api/transactions${query}`, { workspaceId }), noParams);

const list = async (query = "") =>
  (await (await get(query)).json()) as TransactionListDto;

const sum = (selected: TransactionRow[]) =>
  selected.reduce((total, row) => total + row.amountCents, 0);

beforeAll(async () => {
  rows = await ledgerRows(context.db, WORKSPACE_ID);
});

describe("GET /api/transactions", () => {
  it("returns the newest 25 transactions and totals for the whole ledger", async () => {
    const response = await get();
    const body = (await response.json()) as TransactionListDto;
    const moved = rows.filter((row) => row.status !== "failed");

    expect(response.status).toBe(200);
    expect(body.total).toBe(rows.length);
    expect(body.total).toBeGreaterThan(800);
    expect(body).toMatchObject({
      page: 1,
      pageSize: 25,
      pageCount: Math.ceil(rows.length / 25),
    });
    expect(body.items).toHaveLength(25);
    expect(body.items.map((item) => item.postedAt)).toEqual(
      body.items
        .map((item) => item.postedAt)
        .sort()
        .reverse(),
    );
    expect(body.items[0].status).toBe("scheduled");
    expect(body.summary).toEqual({
      inflowCents: sum(moved.filter((row) => row.amountCents > 0)),
      outflowCents: -sum(moved.filter((row) => row.amountCents < 0)),
      netCents: sum(moved),
    });
  });

  it("filters by status from the query string", async () => {
    const failed = await list("?status=failed");

    expect(failed.total).toBe(1);
    expect(failed.items[0]).toMatchObject({
      description: "Hartwell Staffing",
      amountCents: -420_000,
      status: "failed",
      note: "Returned by receiving bank (R03: no account, unable to locate).",
    });
    expect(failed.summary).toEqual({
      inflowCents: 0,
      outflowCents: 0,
      netCents: 0,
    });
  });

  it("filters by several categories and a larger page size", async () => {
    const body = await list("?category=rent,payroll&pageSize=100");
    const expected = rows.filter(
      (row) => row.category === "rent" || row.category === "payroll",
    );

    expect(body.total).toBe(expected.length);
    expect(body.items).toHaveLength(expected.length);
    expect(new Set(body.items.map((item) => item.description))).toEqual(
      new Set(["Gusto Payroll", "WeWork · 600 Congress Ave"]),
    );
    expect(body.summary.outflowCents).toBe(-sum(expected));
  });

  it("searches, filters by direction and date, and sorts by amount", async () => {
    const body = await list(
      "?q=stripe&direction=in&from=2026-05-01&to=2026-05-31&sort=amount&order=asc",
    );
    const expected = rows
      .filter(
        (row) =>
          row.description === "Stripe" &&
          row.postedAt.toISOString().startsWith("2026-05"),
      )
      .map((row) => row.amountCents)
      .sort((a, b) => a - b);

    expect(expected.length).toBeGreaterThan(10);
    expect(body.items.map((item) => item.amountCents)).toEqual(expected);
    expect(body.summary).toEqual({
      inflowCents: expected.reduce((total, cents) => total + cents, 0),
      outflowCents: 0,
      netCents: expected.reduce((total, cents) => total + cents, 0),
    });
  });

  it("filters by account, card and amount range", async () => {
    const [, , treasury] = await listAccounts(context.db, WORKSPACE_ID);
    const treasuryRows = await list(`?accountId=${treasury.id}&pageSize=100`);
    const softwareCardId = rows.find(
      (row) => row.description === "Slack",
    )!.cardId!;
    const inRange = await list(
      `?cardId=${softwareCardId}&minCents=170000&maxCents=180000&pageSize=100`,
    );
    const expected = rows.filter(
      (row) =>
        row.cardId === softwareCardId &&
        Math.abs(row.amountCents) >= 170_000 &&
        Math.abs(row.amountCents) <= 180_000,
    );

    // Twelve monthly sweeps out and twelve interest payments in.
    expect(treasuryRows.total).toBe(24);
    expect(new Set(treasuryRows.items.map((item) => item.accountName))).toEqual(
      new Set(["Treasury"]),
    );
    // HubSpot's fixed $1,780 charge always falls in the range.
    expect(inRange.items.map((item) => item.id).sort()).toEqual(
      expected.map((row) => row.id).sort(),
    );
    expect(
      inRange.items.filter((item) => item.description === "HubSpot"),
    ).toHaveLength(12);
    for (const item of inRange.items) {
      expect(item.cardLabel).toBe("Software & SaaS");
    }
  });

  it("answers 200 with no matches when the search is a number too long to be an amount", async () => {
    const response = await get("?q=202418874821202418874821");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 0, items: [] });
  });

  it("pages through results without overlap", async () => {
    const first = await list("?pageSize=10&page=1");
    const second = await list("?pageSize=10&page=2");
    const firstIds = first.items.map((item) => item.id);

    expect(second.page).toBe(2);
    expect(second.items).toHaveLength(10);
    for (const item of second.items) expect(firstIds).not.toContain(item.id);
    expect(second.summary).toEqual(first.summary);
  });

  it("serves the last page when asked for one past the end", async () => {
    const body = await list("?pageSize=100&page=999");

    expect(body.page).toBe(body.pageCount);
    expect(body.items).toHaveLength(rows.length % 100);
  });

  it.each([
    ["an unsupported page size", "?pageSize=7", "pageSize"],
    ["page zero", "?page=0", "page"],
    ["an unknown category", "?category=rent,bogus", "category.1"],
    ["an unknown status", "?status=lost", "status.0"],
    ["a direction that is not in or out", "?direction=sideways", "direction"],
    ["a date in the wrong format", "?from=06/01/2026", "from"],
    ["a negative amount bound", "?minCents=-1", "minCents"],
    ["a malformed account id", "?accountId=42", "accountId"],
    ["an unknown sort field", "?sort=balance", "sort"],
    ["a search longer than 100 characters", `?q=${"x".repeat(101)}`, "q"],
  ])("answers 422 for %s", async (_label, query, field) => {
    const response = await get(query);

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("validation_error");
    expect(Object.keys(error.fields ?? {})).toEqual([field]);
  });

  it("names the page-size problem in plain words", async () => {
    const error = await errorOf(await get("?pageSize=7"));

    expect(error.fields).toEqual({ pageSize: "Unsupported page size" });
  });

  it("gives another visitor their own ledger, not this one", async () => {
    const theirs = (await (
      await get("?pageSize=100", OTHER_WORKSPACE_ID)
    ).json()) as TransactionListDto;
    const myIds = new Set(rows.map((row) => row.id));

    expect(theirs.total).toBe(rows.length);
    for (const item of theirs.items) expect(myIds.has(item.id)).toBe(false);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await get("", null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
