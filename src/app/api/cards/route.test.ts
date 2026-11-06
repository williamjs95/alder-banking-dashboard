// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
  UNKNOWN_ID,
} from "../../../../test/server-http";
import type { AccountDto, CardDto } from "@/lib/contracts";
import { listAccounts } from "@/server/services/accounts";
import { GET, POST } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let checking: AccountDto;

const list = async (workspaceId: string = WORKSPACE_ID) =>
  (await (
    await GET(apiRequest("/api/cards", { workspaceId }), noParams)
  ).json()) as CardDto[];

const create = (json: unknown, workspaceId: string | null = WORKSPACE_ID) =>
  POST(
    apiRequest("/api/cards", { method: "POST", json, workspaceId }),
    noParams,
  );

const validCard = () => ({
  label: "Conference travel",
  holderName: "Priya Patel",
  accountId: checking.id,
  monthlyLimitCents: 2_500_00,
});

beforeAll(async () => {
  [checking] = await listAccounts(context.db, WORKSPACE_ID);
});

describe("GET /api/cards", () => {
  it("lists the workspace's cards, oldest first", async () => {
    const response = await GET(apiRequest("/api/cards"), noParams);
    const cards = (await response.json()) as CardDto[];

    expect(response.status).toBe(200);
    expect(
      cards.map((card) => [card.label, card.last4, card.type, card.status]),
    ).toEqual([
      ["Cloud infrastructure", "4417", "virtual", "active"],
      ["Software & SaaS", "8203", "virtual", "active"],
      ["Marketing", "5961", "virtual", "active"],
      ["Travel & meals", "3078", "physical", "active"],
      ["Office", "7742", "physical", "active"],
      ["Events", "1186", "virtual", "frozen"],
    ]);
    for (const card of cards) {
      expect(card.accountName).toBe("Operating Checking");
    }
  });

  it("reports this month's spend per card", async () => {
    const cards = await list();
    const spend = Object.fromEntries(
      cards.map((card) => [card.label, card.spentThisMonthCents]),
    );

    // By June 18 the software card has paid its fixed subscriptions due on
    // the 1st to the 17th plus OpenAI on the 4th; the frozen card has paid nothing.
    const fixedSubscriptions = 864 + 1_312 + 480 + 675 + 1_134 + 420 + 299;
    expect(spend["Software & SaaS"]).toBeGreaterThan(fixedSubscriptions * 100);
    expect(spend["Events"]).toBe(0);
    for (const cents of Object.values(spend)) {
      expect(Number.isInteger(cents)).toBe(true);
      expect(cents).toBeGreaterThanOrEqual(0);
    }
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await GET(
      apiRequest("/api/cards", { workspaceId: null }),
      noParams,
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});

describe("POST /api/cards", () => {
  it("issues a virtual card and answers 201 with it", async () => {
    const before = await list();

    const response = await create(validCard());
    const card = (await response.json()) as CardDto;

    expect(response.status).toBe(201);
    expect(card).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      accountId: checking.id,
      accountName: "Operating Checking",
      label: "Conference travel",
      holderName: "Priya Patel",
      last4: expect.stringMatching(/^\d{4}$/),
      type: "virtual",
      status: "active",
      monthlyLimitCents: 250_000,
      spentThisMonthCents: 0,
      expMonth: 6,
      expYear: 2030,
    });
    expect(await list()).toEqual([...before, card]);
  });

  it("trims the label and cardholder name", async () => {
    const response = await create({
      ...validCard(),
      label: "  Offsite  ",
      holderName: "  Sam Okafor ",
    });

    expect(await response.json()).toMatchObject({
      label: "Offsite",
      holderName: "Sam Okafor",
    });
  });

  it("answers 422 with a message per invalid field and creates nothing", async () => {
    const before = await list();

    const response = await create({
      label: "x",
      holderName: "",
      accountId: "not-an-account",
      monthlyLimitCents: 50_00,
    });

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Some fields need attention.",
      fields: {
        label: "Give the card a name",
        holderName: "Enter the cardholder's name",
        accountId: "Choose an account",
        monthlyLimitCents: "The minimum limit is $100",
      },
    });
    expect(await list()).toEqual(before);
  });

  it("answers 422 for a limit above $250,000", async () => {
    const response = await create({
      ...validCard(),
      monthlyLimitCents: 250_000_01,
    });

    expect(response.status).toBe(422);
    expect((await errorOf(response)).fields).toEqual({
      monthlyLimitCents: "The maximum limit is $250,000",
    });
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await POST(
      apiRequest("/api/cards", { method: "POST", rawBody: "label=Travel" }),
      noParams,
    );

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: "bad_request",
      message: "The request body is not JSON.",
    });
  });

  it("answers 404 for an account that does not exist", async () => {
    const response = await create({ ...validCard(), accountId: UNKNOWN_ID });

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Account was not found.",
    });
  });

  it("answers 404 when another visitor tries to use this workspace's account", async () => {
    const mineBefore = await list();

    const response = await create(validCard(), OTHER_WORKSPACE_ID);

    expect(response.status).toBe(404);
    expect(await list()).toEqual(mineBefore);
    expect(await list(OTHER_WORKSPACE_ID)).toHaveLength(6);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await create(validCard(), null);

    expect(response.status).toBe(401);
  });
});
