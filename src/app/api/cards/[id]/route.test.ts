// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NOW, OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../test/db";
import {
  apiRequest,
  errorOf,
  segment,
  setupSeededRouteDb,
  UNKNOWN_ID,
} from "../../../../../test/server-http";
import { listCards } from "@/server/services/cards";
import { PATCH } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();

const cards = () => listCards(context.db, WORKSPACE_ID, NOW);
const card = async (label: string) =>
  (await cards()).find((candidate) => candidate.label === label)!;

const patch = (
  id: string,
  json: unknown,
  workspaceId: string | null = WORKSPACE_ID,
) =>
  PATCH(
    apiRequest(`/api/cards/${id}`, { method: "PATCH", json, workspaceId }),
    segment({ id }),
  );

describe("PATCH /api/cards/:id", () => {
  it("freezes a card and returns it", async () => {
    const office = await card("Office");

    const response = await patch(office.id, { status: "frozen" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...office, status: "frozen" });
    expect((await card("Office")).status).toBe("frozen");
  });

  it("unfreezes a frozen card", async () => {
    const events = await card("Events");
    expect(events.status).toBe("frozen");

    const response = await patch(events.id, { status: "active" });

    expect(response.status).toBe(200);
    expect((await card("Events")).status).toBe("active");
  });

  it("changes the monthly limit without touching anything else", async () => {
    const marketing = await card("Marketing");
    const others = (await cards()).filter((item) => item.id !== marketing.id);

    const response = await patch(marketing.id, {
      monthlyLimitCents: 40_000_00,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...marketing,
      monthlyLimitCents: 4_000_000,
    });
    expect((await cards()).filter((item) => item.id !== marketing.id)).toEqual(
      others,
    );
  });

  it("answers 422 when there is nothing to update", async () => {
    const travel = await card("Travel & meals");

    const response = await patch(travel.id, {});

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Some fields need attention.",
      fields: { _: "Nothing to update" },
    });
  });

  it.each([
    ["an unknown status", { status: "closed" }, "status"],
    ["a limit under $100", { monthlyLimitCents: 99_99 }, "monthlyLimitCents"],
    [
      "a limit over $250,000",
      { monthlyLimitCents: 250_000_01 },
      "monthlyLimitCents",
    ],
    ["a fractional limit", { monthlyLimitCents: 500.5 }, "monthlyLimitCents"],
  ])(
    "answers 422 for %s and leaves the card alone",
    async (_label, body, field) => {
      const travel = await card("Travel & meals");

      const response = await patch(travel.id, body);

      expect(response.status).toBe(422);
      expect(Object.keys((await errorOf(response)).fields ?? {})).toEqual([
        field,
      ]);
      expect(await card("Travel & meals")).toEqual(travel);
    },
  );

  it("answers 400 when the body is not JSON", async () => {
    const travel = await card("Travel & meals");

    const response = await PATCH(
      apiRequest(`/api/cards/${travel.id}`, { method: "PATCH", rawBody: "{" }),
      segment({ id: travel.id }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("bad_request");
  });

  it.each([
    ["an unknown id", UNKNOWN_ID],
    ["a malformed id", "card-1"],
  ])("answers 404 for %s", async (_label, id) => {
    const response = await patch(id, { status: "frozen" });

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Card was not found.",
    });
  });

  it("answers 404 and changes nothing when the card belongs to another workspace", async () => {
    const cloud = await card("Cloud infrastructure");

    const response = await patch(
      cloud.id,
      { status: "frozen", monthlyLimitCents: 100_00 },
      OTHER_WORKSPACE_ID,
    );

    expect(response.status).toBe(404);
    expect(await card("Cloud infrastructure")).toEqual(cloud);
  });

  it("answers 401 without a workspace cookie", async () => {
    const cloud = await card("Cloud infrastructure");

    const response = await patch(cloud.id, { status: "frozen" }, null);

    expect(response.status).toBe(401);
    expect(await card("Cloud infrastructure")).toEqual(cloud);
  });
});
