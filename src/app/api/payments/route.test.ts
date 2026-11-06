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
import { balanceOf, countRows } from "../../../../test/server-ledger";
import type {
  AccountDto,
  PaymentResultDto,
  RecipientDto,
} from "@/lib/contracts";
import { transactions } from "@/server/db/schema";
import { listAccounts } from "@/server/services/accounts";
import { listRecipients } from "@/server/services/recipients";
import { POST } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let checking: AccountDto;
let pilot: RecipientDto;

const send = (
  json: unknown,
  {
    key,
    workspaceId = WORKSPACE_ID,
  }: { key?: string; workspaceId?: string | null } = {},
) =>
  POST(
    apiRequest("/api/payments", {
      method: "POST",
      json,
      workspaceId,
      headers: key ? { "Idempotency-Key": key } : {},
    }),
    noParams,
  );

const validPayment = (overrides: Record<string, unknown> = {}) => ({
  fromAccountId: checking.id,
  recipientId: pilot.id,
  amountCents: 1_950_00,
  method: "ach",
  ...overrides,
});

const balance = () => balanceOf(context.db, checking.id);
const rows = () => countRows(context.db, transactions, WORKSPACE_ID);

/** Runs a request that must be rejected and proves it moved nothing. */
async function rejected(request: () => Promise<Response>): Promise<Response> {
  const before = { balance: await balance(), rows: await rows() };
  const response = await request();
  expect({ balance: await balance(), rows: await rows() }).toEqual(before);
  return response;
}

beforeAll(async () => {
  [checking] = await listAccounts(context.db, WORKSPACE_ID);
  pilot = (await listRecipients(context.db, WORKSPACE_ID)).find(
    (recipient) => recipient.name === "Pilot.com, Inc.",
  )!;
});

describe("POST /api/payments", () => {
  it("sends an ACH payment: 201, a pending ledger row and a lower balance", async () => {
    const before = await balance();

    const response = await send(validPayment({ memo: "June bookkeeping" }));
    const { payment, fee } = (await response.json()) as PaymentResultDto;

    expect(response.status).toBe(201);
    expect(payment).toMatchObject({
      accountId: checking.id,
      accountName: "Operating Checking",
      recipientId: pilot.id,
      description: "Pilot.com, Inc.",
      amountCents: -195_000,
      method: "ach",
      status: "pending",
      note: "June bookkeeping",
      postedAt: "2026-06-18T16:30:00.000Z",
    });
    expect(fee).toBeNull();
    expect(await balance()).toBe(before - 195_000);
  });

  it("adds the $15 fee to a wire", async () => {
    const before = await balance();

    const response = await send(validPayment({ method: "wire" }));
    const { payment, fee } = (await response.json()) as PaymentResultDto;

    expect(response.status).toBe(201);
    expect(payment.amountCents).toBe(-195_000);
    expect(fee).toMatchObject({
      description: "Outgoing wire fee",
      amountCents: -1_500,
      note: "Fee for wire to Pilot.com, Inc.",
    });
    expect(await balance()).toBe(before - 195_000 - 1_500);
  });

  it("schedules a future payment without moving money", async () => {
    const before = await balance();

    const response = await send(validPayment({ scheduledFor: "2026-07-10" }));
    const { payment, fee } = (await response.json()) as PaymentResultDto;

    expect(response.status).toBe(201);
    expect(payment).toMatchObject({
      status: "scheduled",
      postedAt: "2026-07-10T15:00:00.000Z",
    });
    expect(fee).toBeNull();
    expect(await balance()).toBe(before);
  });

  it("replays a request with the same Idempotency-Key instead of paying twice", async () => {
    const before = await balance();

    const first = await send(validPayment({ method: "wire" }), {
      key: "wire-42",
    });
    const replay = await send(validPayment({ method: "wire" }), {
      key: "wire-42",
    });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(await balance()).toBe(before - 195_000 - 1_500);
  });

  it("answers 422 with a message per invalid field", async () => {
    const response = await rejected(() =>
      send({
        fromAccountId: "nope",
        recipientId: "nope",
        amountCents: 0,
        method: "cash",
        memo: "x".repeat(141),
        scheduledFor: "tomorrow",
      }),
    );

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("validation_error");
    expect(error.message).toBe("Some fields need attention.");
    expect(error.fields).toMatchObject({
      fromAccountId: "Choose an account",
      recipientId: "Choose a recipient",
      amountCents: "Enter an amount greater than zero",
      memo: "Keep the memo under 140 characters",
    });
    expect(Object.keys(error.fields ?? {}).sort()).toEqual([
      "amountCents",
      "fromAccountId",
      "memo",
      "method",
      "recipientId",
      "scheduledFor",
    ]);
  });

  it.each([
    ["a missing amount", undefined, "Enter an amount"],
    ["an amount typed as text", "1950", "Enter an amount"],
    ["fractional cents", 10.5, "Enter an amount in whole cents"],
    ["a negative amount", -5, "Enter an amount greater than zero"],
    [
      "an amount over the limit",
      1_000_000_000_01,
      "Amount is above the per-payment limit",
    ],
  ])("answers 422 for %s", async (_label, amountCents, message) => {
    const response = await rejected(() => send(validPayment({ amountCents })));

    expect(response.status).toBe(422);
    expect((await errorOf(response)).fields).toEqual({ amountCents: message });
  });

  it("answers 422 insufficient_funds when the balance does not cover the payment", async () => {
    const response = await rejected(async () =>
      send(validPayment({ amountCents: (await balance()) + 1 })),
    );

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "insufficient_funds",
      message: "Operating Checking does not have enough available funds.",
      fields: { amountCents: "Amount exceeds the available balance" },
    });
  });

  it("answers 422 when the scheduled date is today", async () => {
    const response = await rejected(() =>
      send(validPayment({ scheduledFor: "2026-06-18" })),
    );

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Choose a date in the future.",
      fields: { scheduledFor: "Choose a date in the future" },
    });
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await rejected(() =>
      POST(
        apiRequest("/api/payments", { method: "POST", rawBody: "amount=5" }),
        noParams,
      ),
    );

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: "bad_request",
      message: "The request body is not JSON.",
    });
  });

  it("answers 400 for an Idempotency-Key longer than 100 characters", async () => {
    const response = await rejected(() =>
      send(validPayment(), { key: "k".repeat(101) }),
    );

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: "bad_request",
      message: "Idempotency-Key is too long.",
    });
  });

  it.each([
    ["account", { fromAccountId: UNKNOWN_ID }, "Account was not found."],
    ["recipient", { recipientId: UNKNOWN_ID }, "Recipient was not found."],
  ])("answers 404 for an unknown %s", async (_label, overrides, message) => {
    const response = await rejected(() => send(validPayment(overrides)));

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({ code: "not_found", message });
  });

  it("answers 404 when another visitor tries to pay from this workspace's account", async () => {
    const response = await rejected(() =>
      send(validPayment(), { workspaceId: OTHER_WORKSPACE_ID }),
    );

    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toBe("Account was not found.");
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await rejected(() =>
      send(validPayment(), { workspaceId: null }),
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
