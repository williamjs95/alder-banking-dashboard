// @vitest-environment node
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { NOW, OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../../test/server-http";
import { countRows, ledgerRows } from "../../../../../test/server-ledger";
import { createRecipientSchema } from "@/lib/contracts";
import { transactions, workspaces } from "@/server/db/schema";
import { listAccounts } from "@/server/services/accounts";
import { createPayment } from "@/server/services/payments";
import { createRecipient, listRecipients } from "@/server/services/recipients";
import { ensureWorkspace } from "@/server/services/workspace";
import { POST } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

const context = setupSeededRouteDb();

const reset = (workspaceId: string | null = WORKSPACE_ID) =>
  POST(
    apiRequest("/api/demo/reset", { method: "POST", workspaceId }),
    noParams,
  );

/** The visible state of a workspace, without row ids (a reset reissues them). */
async function fingerprint(workspaceId: string) {
  const { db } = context;
  return {
    balances: (await listAccounts(db, workspaceId)).map((account) => [
      account.name,
      account.balanceCents,
    ]),
    recipients: (await listRecipients(db, workspaceId)).map((row) => row.name),
    ledger: (await ledgerRows(db, workspaceId))
      .map((row) => `${row.reference} ${row.amountCents} ${row.status}`)
      .sort(),
  };
}

/** Changes a workspace the way a visitor playing with the demo would. */
async function makeChanges(workspaceId: string) {
  const { db } = context;
  const [checking] = await listAccounts(db, workspaceId);
  const recipient = await createRecipient(
    db,
    workspaceId,
    createRecipientSchema.parse({
      name: "Added by the visitor",
      bankName: "Some Bank",
      routingNumber: "026009593",
      accountNumber: "000123456789",
    }),
    NOW,
  );
  await createPayment(
    db,
    workspaceId,
    {
      fromAccountId: checking.id,
      recipientId: recipient.id,
      amountCents: 5_000_00,
      method: "wire",
    },
    { now: NOW },
  );
}

describe("POST /api/demo/reset", () => {
  it("discards the visitor's changes and restores the seeded company", async () => {
    const pristine = await fingerprint(WORKSPACE_ID);
    await makeChanges(WORKSPACE_ID);
    expect(await fingerprint(WORKSPACE_ID)).not.toEqual(pristine);

    const response = await reset();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await fingerprint(WORKSPACE_ID)).toEqual(pristine);
  });

  it("reissues row ids, so links into the old data stop resolving", async () => {
    const before = await listAccounts(context.db, WORKSPACE_ID);

    await reset();

    const after = await listAccounts(context.db, WORKSPACE_ID);
    expect(after.map((account) => account.name)).toEqual(
      before.map((account) => account.name),
    );
    for (const account of after) {
      expect(before.map((old) => old.id)).not.toContain(account.id);
    }
  });

  it("leaves other visitors' workspaces alone", async () => {
    await ensureWorkspace(context.db, OTHER_WORKSPACE_ID, NOW);
    await makeChanges(OTHER_WORKSPACE_ID);
    const theirs = await fingerprint(OTHER_WORKSPACE_ID);
    const theirRows = await ledgerRows(context.db, OTHER_WORKSPACE_ID);

    await reset();

    expect(await fingerprint(OTHER_WORKSPACE_ID)).toEqual(theirs);
    expect(await ledgerRows(context.db, OTHER_WORKSPACE_ID)).toEqual(theirRows);
  });

  it("can be repeated", async () => {
    const pristine = await fingerprint(WORKSPACE_ID);

    expect((await reset()).status).toBe(200);
    expect((await reset()).status).toBe(200);

    expect(await fingerprint(WORKSPACE_ID)).toEqual(pristine);
    expect(
      await context.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, WORKSPACE_ID)),
    ).toHaveLength(1);
  });

  it("answers 401 without a workspace cookie and resets nothing", async () => {
    await makeChanges(WORKSPACE_ID);
    const changed = await countRows(context.db, transactions, WORKSPACE_ID);

    const response = await reset(null);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
    expect(await countRows(context.db, transactions, WORKSPACE_ID)).toBe(
      changed,
    );
  });
});
