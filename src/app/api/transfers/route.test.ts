// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
  UNKNOWN_ID,
} from "../../../../test/server-http";
import { balanceOf, countRows } from "../../../../test/server-ledger";
import type { AccountDto, TransferResultDto } from "@/lib/contracts";
import { transactions } from "@/server/db/schema";
import { listAccounts } from "@/server/services/accounts";
import { listRecipients } from "@/server/services/recipients";
import { POST as sendPayment } from "../payments/route";
import { POST } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();
let checking: AccountDto;
let savings: AccountDto;
let consoleError: ReturnType<typeof vi.spyOn>;

const move = (
  json: unknown,
  {
    key,
    workspaceId = WORKSPACE_ID,
  }: { key?: string; workspaceId?: string | null } = {},
) =>
  POST(
    apiRequest("/api/transfers", {
      method: "POST",
      json,
      workspaceId,
      headers: key ? { "Idempotency-Key": key } : {},
    }),
    noParams,
  );

const validTransfer = (overrides: Record<string, unknown> = {}) => ({
  fromAccountId: savings.id,
  toAccountId: checking.id,
  amountCents: 25_000_00,
  ...overrides,
});

const state = async () => ({
  checking: await balanceOf(context.db, checking.id),
  savings: await balanceOf(context.db, savings.id),
  rows: await countRows(context.db, transactions, WORKSPACE_ID),
});

/** Runs a request that must be rejected and proves it moved nothing. */
async function rejected(request: () => Promise<Response>): Promise<Response> {
  const before = await state();
  const response = await request();
  expect(await state()).toEqual(before);
  return response;
}

beforeAll(async () => {
  [checking, savings] = await listAccounts(context.db, WORKSPACE_ID);
});

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("POST /api/transfers", () => {
  it("moves the money and answers 201 with both legs", async () => {
    const before = await state();

    const response = await move(validTransfer({ memo: "Cover payroll" }));
    const { debit, credit } = (await response.json()) as TransferResultDto;

    expect(response.status).toBe(201);
    expect(debit).toMatchObject({
      accountName: "Savings Reserve",
      counterpartyAccountName: "Operating Checking",
      description: "Transfer to Operating Checking",
      amountCents: -2_500_000,
      category: "transfer",
      status: "posted",
      note: "Cover payroll",
      postedAt: "2026-06-18T16:30:00.000Z",
    });
    expect(credit).toMatchObject({
      accountName: "Operating Checking",
      counterpartyAccountName: "Savings Reserve",
      description: "Transfer from Savings Reserve",
      amountCents: 2_500_000,
      status: "posted",
    });
    expect(await state()).toEqual({
      checking: before.checking + 2_500_000,
      savings: before.savings - 2_500_000,
      rows: before.rows + 2,
    });
  });

  it("replays a request with the same Idempotency-Key instead of moving money twice", async () => {
    const before = await state();

    const first = await move(validTransfer(), { key: "sweep-7" });
    const replay = await move(validTransfer(), { key: "sweep-7" });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(await state()).toEqual({
      checking: before.checking + 2_500_000,
      savings: before.savings - 2_500_000,
      rows: before.rows + 2,
    });
  });

  it("answers 409 when the Idempotency-Key was already used for a payment", async () => {
    const [recipient] = await listRecipients(context.db, WORKSPACE_ID);
    const paid = await sendPayment(
      apiRequest("/api/payments", {
        method: "POST",
        json: {
          fromAccountId: checking.id,
          recipientId: recipient.id,
          amountCents: 10_00,
          method: "ach",
        },
        headers: { "Idempotency-Key": "reused-key" },
      }),
      noParams,
    );
    expect(paid.status).toBe(201);

    const response = await rejected(() =>
      move(validTransfer(), { key: "reused-key" }),
    );

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toEqual({
      code: "conflict",
      message: "This Idempotency-Key was already used for a different request.",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("answers 422 when both accounts are the same", async () => {
    const response = await rejected(() =>
      move(validTransfer({ toAccountId: savings.id })),
    );

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Some fields need attention.",
      fields: { toAccountId: "Choose two different accounts" },
    });
  });

  it("answers 422 with a message per invalid field", async () => {
    const response = await rejected(() =>
      move({ fromAccountId: "a", toAccountId: "b", amountCents: 0 }),
    );

    expect(response.status).toBe(422);
    expect((await errorOf(response)).fields).toEqual({
      fromAccountId: "Choose an account",
      toAccountId: "Choose an account",
      amountCents: "Enter an amount greater than zero",
    });
  });

  it("answers 422 insufficient_funds when the source balance does not cover the transfer", async () => {
    const response = await rejected(async () =>
      move(validTransfer({ amountCents: (await state()).savings + 1 })),
    );

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "insufficient_funds",
      message: "Savings Reserve does not have enough available funds.",
      fields: { amountCents: "Amount exceeds the available balance" },
    });
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await rejected(() =>
      POST(
        apiRequest("/api/transfers", { method: "POST", rawBody: "<xml/>" }),
        noParams,
      ),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("bad_request");
  });

  it("answers 400 for an Idempotency-Key longer than 100 characters", async () => {
    const response = await rejected(() =>
      move(validTransfer(), { key: "k".repeat(101) }),
    );

    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe(
      "Idempotency-Key is too long.",
    );
  });

  it.each([
    ["source", { fromAccountId: UNKNOWN_ID }],
    ["destination", { toAccountId: UNKNOWN_ID }],
  ])("answers 404 for an unknown %s account", async (_label, overrides) => {
    const response = await rejected(() => move(validTransfer(overrides)));

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      code: "not_found",
      message: "Account was not found.",
    });
  });

  it("answers 404 when another visitor tries to move this workspace's money", async () => {
    const response = await rejected(() =>
      move(validTransfer(), { workspaceId: OTHER_WORKSPACE_ID }),
    );

    expect(response.status).toBe(404);
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await rejected(() =>
      move(validTransfer(), { workspaceId: null }),
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});
