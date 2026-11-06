// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../../test/server-http";
import { ledgerRows } from "../../../../../test/server-ledger";
import type { TransactionRow } from "@/server/db/schema";
import { updateTransaction } from "@/server/services/transactions";
import { GET } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let rows: TransactionRow[];

const HEADER =
  "Date,Description,Amount,Status,Category,Method,Account,Reference,Note";

const get = (query = "", workspaceId: string | null = WORKSPACE_ID) =>
  GET(
    apiRequest(`/api/transactions/export${query}`, { workspaceId }),
    noParams,
  );

/** The data lines of an export, without the header or the trailing newline. */
async function lines(query = ""): Promise<string[]> {
  const text = await (await get(query)).text();
  const [header, ...rest] = text.split("\r\n");
  expect(header).toBe(HEADER);
  expect(rest.at(-1)).toBe("");
  return rest.slice(0, -1);
}

const named = (description: string) =>
  rows.find((row) => row.description === description)!;

beforeAll(async () => {
  rows = await ledgerRows(context.db, WORKSPACE_ID);
});

describe("GET /api/transactions/export", () => {
  it("answers with a CSV download named after today's date", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="alder-transactions-2026-06-18.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("exports every transaction, not just one page, under a header row", async () => {
    const exported = await lines("?pageSize=10&page=3");

    expect(exported).toHaveLength(rows.length);
    expect(exported.length).toBeGreaterThan(800);
  });

  it("writes one transaction per line with a signed decimal amount and readable labels", async () => {
    const slack = named("Slack");
    const exported = await lines("?q=slack&sort=date&order=asc");

    expect(exported).toHaveLength(12);
    expect(exported[0]).toBe(
      [
        slack.postedAt.toISOString().slice(0, 10),
        "Slack",
        "-1312.00",
        "Posted",
        "Software",
        "Card",
        "Operating Checking",
        slack.reference,
        "",
      ].join(","),
    );
  });

  it("writes money in as a positive amount without a plus sign", async () => {
    const exported = await lines("?q=Northgate");

    expect(exported).toHaveLength(12);
    for (const line of exported) {
      expect(line).toContain(",Northgate Health,32000.00,Posted,Revenue,Wire,");
    }
  });

  it("quotes cells that contain commas", async () => {
    const [failed] = await lines("?status=failed");
    const hartwell = named("Hartwell Staffing");

    expect(failed).toBe(
      `2026-05-26,Hartwell Staffing,-4200.00,Failed,Professional services,ACH,Operating Checking,${hartwell.reference},"Returned by receiving bank (R03: no account, unable to locate)."`,
    );
    expect(await lines("?q=Pilot.com&pageSize=10")).toHaveLength(12);
    expect((await lines("?q=Pilot.com"))[0]).toContain(',"Pilot.com, Inc.",');
  });

  it("applies the same filters and sort order as the list", async () => {
    const exported = await lines(
      "?category=rent&status=posted&sort=date&order=asc",
    );
    const expected = rows.filter(
      (row) => row.category === "rent" && row.status === "posted",
    );

    expect(exported.map((line) => line.split(",")[0])).toEqual(
      expected.map((row) => row.postedAt.toISOString().slice(0, 10)),
    );
    expect(exported).toHaveLength(12);
  });

  it("returns only the header when nothing matches", async () => {
    const response = await get("?q=no-such-merchant");

    expect(await response.text()).toBe(`${HEADER}\r\n`);
  });

  it("neutralises notes that a spreadsheet would run as a formula", async () => {
    const zoom = named("Zoom");
    await updateTransaction(context.db, WORKSPACE_ID, zoom.id, {
      note: '=HYPERLINK("http://evil.example","Click")',
    });

    const [line] = await lines(`?q=${zoom.reference}`);

    expect(
      line.endsWith(`,"'=HYPERLINK(""http://evil.example"",""Click"")"`),
    ).toBe(true);
  });

  it("leaves an ordinary note as written", async () => {
    const linear = named("Linear");
    await updateTransaction(context.db, WORKSPACE_ID, linear.id, {
      note: "Engineering seats",
    });

    const [line] = await lines(`?q=${linear.reference}`);

    expect(line.endsWith(",Engineering seats")).toBe(true);
  });

  it("answers 422 for an invalid filter instead of exporting everything", async () => {
    const response = await get("?direction=sideways");

    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(Object.keys((await errorOf(response)).fields ?? {})).toEqual([
      "direction",
    ]);
  });

  it("exports another visitor's own ledger, without this workspace's notes", async () => {
    await updateTransaction(context.db, WORKSPACE_ID, named("GitHub").id, {
      note: "Private to the first workspace",
    });

    const theirs = await (await get("", OTHER_WORKSPACE_ID)).text();
    const mine = await (await get()).text();

    expect(mine).toContain("Private to the first workspace");
    expect(theirs).not.toContain("Private to the first workspace");
    expect(theirs.split("\r\n")).toHaveLength(rows.length + 2);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await get("", null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
