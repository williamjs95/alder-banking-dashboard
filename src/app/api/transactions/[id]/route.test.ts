// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../test/db";
import {
  apiRequest,
  errorOf,
  segment,
  setupSeededRouteDb,
  UNKNOWN_ID,
} from "../../../../../test/server-http";
import { ledgerRows } from "../../../../../test/server-ledger";
import type { TransactionDto } from "@/lib/contracts";
import type { TransactionRow } from "@/server/db/schema";
import { GET, PATCH } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let rows: TransactionRow[];

const named = (description: string) =>
  rows.find((row) => row.description === description)!;

const get = (id: string, workspaceId: string | null = WORKSPACE_ID) =>
  GET(apiRequest(`/api/transactions/${id}`, { workspaceId }), segment({ id }));

const patch = (
  id: string,
  json: unknown,
  workspaceId: string | null = WORKSPACE_ID,
) =>
  PATCH(
    apiRequest(`/api/transactions/${id}`, {
      method: "PATCH",
      json,
      workspaceId,
    }),
    segment({ id }),
  );

const read = async (id: string) =>
  (await (await get(id)).json()) as TransactionDto;

beforeAll(async () => {
  rows = await ledgerRows(context.db, WORKSPACE_ID);
});

describe("GET /api/transactions/:id", () => {
  it("returns a card purchase with its account and card", async () => {
    const slack = named("Slack");

    const response = await get(slack.id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: slack.id,
      accountId: slack.accountId,
      accountName: "Operating Checking",
      postedAt: slack.postedAt.toISOString(),
      description: "Slack",
      amountCents: -131_200,
      category: "software",
      method: "card",
      status: "posted",
      reference: slack.reference,
      note: null,
      cardId: slack.cardId,
      cardLabel: "Software & SaaS",
      cardLast4: "8203",
      recipientId: null,
      counterpartyAccountName: null,
    });
  });

  it("names the other account on a transfer", async () => {
    const sweep = await read(named("Transfer to Operating Checking").id);

    expect(sweep).toMatchObject({
      accountName: "Treasury",
      counterpartyAccountName: "Operating Checking",
      amountCents: -6_000_000,
    });
  });

  it.each([
    ["an unknown id", UNKNOWN_ID],
    ["a malformed id", "latest"],
  ])("answers 404 for %s", async (_label, id) => {
    const response = await get(id);

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Transaction was not found.",
    });
  });

  it("answers 404 when the transaction belongs to another workspace", async () => {
    const response = await get(named("Slack").id, OTHER_WORKSPACE_ID);

    expect(response.status).toBe(404);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await get(named("Slack").id, null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("saves a trimmed note", async () => {
    const figma = named("Figma");

    const response = await patch(figma.id, { note: "  Design team seats  " });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: figma.id,
      note: "Design team seats",
      category: "software",
    });
    expect((await read(figma.id)).note).toBe("Design team seats");
  });

  it("clears a note with null or an empty string", async () => {
    const notion = named("Notion");
    await patch(notion.id, { note: "Temporary" });

    const cleared = await patch(notion.id, { note: null });
    expect((await cleared.json()).note).toBeNull();

    await patch(notion.id, { note: "Temporary again" });
    const emptied = await patch(notion.id, { note: "   " });
    expect((await emptied.json()).note).toBeNull();
    expect((await read(notion.id)).note).toBeNull();
  });

  it("recategorises a transaction", async () => {
    const openai = named("OpenAI");

    const response = await patch(openai.id, { category: "cloud" });

    expect(response.status).toBe(200);
    expect(await read(openai.id)).toMatchObject({
      category: "cloud",
      amountCents: openai.amountCents,
      note: null,
    });
  });

  it("answers 422 when there is nothing to update", async () => {
    const response = await patch(named("Zoom").id, {});

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Some fields need attention.",
      fields: { _: "Nothing to update" },
    });
  });

  it.each([
    ["a system-owned category", { category: "transfer" }, "category"],
    ["an unknown category", { category: "snacks" }, "category"],
    ["a note over 280 characters", { note: "x".repeat(281) }, "note"],
    ["a note that is not text", { note: 42 }, "note"],
  ])("answers 422 for %s and saves nothing", async (_label, body, field) => {
    const zoom = named("Zoom");
    const before = await read(zoom.id);

    const response = await patch(zoom.id, body);

    expect(response.status).toBe(422);
    expect(Object.keys((await errorOf(response)).fields ?? {})).toEqual([
      field,
    ]);
    expect(await read(zoom.id)).toEqual(before);
  });

  it("answers 422 when asked to recategorise a transfer or interest", async () => {
    for (const description of ["Transfer from Treasury", "Interest earned"]) {
      const row = named(description);

      const response = await patch(row.id, { category: "revenue" });

      expect(response.status).toBe(422);
      expect(await errorOf(response)).toEqual({
        code: "validation_error",
        message: "This transaction's category is set by the bank.",
        fields: { category: "Category cannot be changed" },
      });
      expect((await read(row.id)).category).toBe(row.category);
    }
  });

  it("answers 400 when the body is not JSON", async () => {
    const zoom = named("Zoom");

    const response = await PATCH(
      apiRequest(`/api/transactions/${zoom.id}`, {
        method: "PATCH",
        rawBody: "note=hello",
      }),
      segment({ id: zoom.id }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("bad_request");
  });

  it.each([
    ["an unknown id", UNKNOWN_ID],
    ["a malformed id", "latest"],
  ])("answers 404 for %s", async (_label, id) => {
    const response = await patch(id, { note: "Hello" });

    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe(
      "Transaction was not found.",
    );
  });

  it("answers 404 and saves nothing when the transaction belongs to another workspace", async () => {
    const github = named("GitHub");
    const before = await read(github.id);

    const response = await patch(
      github.id,
      { note: "Tampered", category: "other" },
      OTHER_WORKSPACE_ID,
    );

    expect(response.status).toBe(404);
    expect(await read(github.id)).toEqual(before);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await patch(named("GitHub").id, { note: "Hello" }, null);

    expect(response.status).toBe(401);
  });
});
