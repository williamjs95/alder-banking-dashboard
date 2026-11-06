// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  sequentialIds,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  addAccount,
  addWorkspace,
  countRows,
  ledgerRows,
} from "../../../test/server-ledger";
import { addDays } from "@/lib/dates";
import type { Db } from "@/server/db/client";
import {
  accounts,
  cards,
  recipients,
  transactions,
  workspaces,
} from "@/server/db/schema";
import { generateSeed } from "@/server/seed/generator";
import { listAccounts } from "./accounts";
import {
  ensureWorkspace,
  purgeStaleWorkspaces,
  resetWorkspace,
  WORKSPACE_TTL_DAYS,
} from "./workspace";

let db: Db;

const workspaceIds = async () =>
  (await db.select({ id: workspaces.id }).from(workspaces))
    .map((row) => row.id)
    .sort();

async function counts(workspaceId: string) {
  return {
    accounts: await countRows(db, accounts, workspaceId),
    recipients: await countRows(db, recipients, workspaceId),
    cards: await countRows(db, cards, workspaceId),
    transactions: await countRows(db, transactions, workspaceId),
  };
}

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(workspaces);
});

describe("ensureWorkspace", () => {
  it("creates the workspace and seeds the whole demo company", async () => {
    const expected = generateSeed({
      workspaceId: WORKSPACE_ID,
      now: NOW,
      newId: sequentialIds(),
    });

    await ensureWorkspace(db, WORKSPACE_ID, NOW, { newId: sequentialIds() });

    expect(await db.select().from(workspaces)).toEqual([
      {
        id: WORKSPACE_ID,
        companyName: "Brightline Labs, Inc.",
        createdAt: NOW,
      },
    ]);
    expect(await counts(WORKSPACE_ID)).toEqual({
      accounts: 3,
      recipients: 6,
      cards: 6,
      transactions: expected.transactions.length,
    });
    // More rows than fit in one insert batch, so batching lost nothing.
    expect(expected.transactions.length).toBeGreaterThan(800);
  });

  it("stores exactly the generated ledger", async () => {
    const expected = generateSeed({
      workspaceId: WORKSPACE_ID,
      now: NOW,
      newId: sequentialIds(),
    });

    await ensureWorkspace(db, WORKSPACE_ID, NOW, { newId: sequentialIds() });

    const stored = await ledgerRows(db, WORKSPACE_ID);
    const key = (row: { id: string }) => row.id;
    const shape = (
      row: (typeof stored)[number] | (typeof expected.transactions)[number],
    ) => ({
      id: row.id,
      accountId: row.accountId,
      postedAt: (row.postedAt as Date).toISOString(),
      description: row.description,
      amountCents: row.amountCents,
      status: row.status,
      reference: row.reference,
    });
    expect(
      stored.map(shape).sort((a, b) => key(a).localeCompare(key(b))),
    ).toEqual(
      expected.transactions
        .map(shape)
        .sort((a, b) => key(a).localeCompare(key(b))),
    );
    expect(
      (await listAccounts(db, WORKSPACE_ID)).map(
        (account) => account.balanceCents,
      ),
    ).toEqual(expected.accounts.map((account) => account.balanceCents));
  });

  it("does nothing for a workspace that already exists", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW);
    const before = await ledgerRows(db, WORKSPACE_ID);

    await ensureWorkspace(db, WORKSPACE_ID, addDays(NOW, 1));

    expect(await ledgerRows(db, WORKSPACE_ID)).toEqual(before);
    expect(await counts(WORKSPACE_ID)).toMatchObject({ accounts: 3, cards: 6 });
  });

  it("does not seed over a workspace that exists but is empty", async () => {
    await addWorkspace(db, WORKSPACE_ID);

    await ensureWorkspace(db, WORKSPACE_ID, NOW);

    expect(await counts(WORKSPACE_ID)).toEqual({
      accounts: 0,
      recipients: 0,
      cards: 0,
      transactions: 0,
    });
  });

  it("seeds once when two requests arrive for a new workspace at the same time", async () => {
    await Promise.all([
      ensureWorkspace(db, WORKSPACE_ID, NOW),
      ensureWorkspace(db, WORKSPACE_ID, NOW),
      ensureWorkspace(db, WORKSPACE_ID, NOW),
    ]);

    expect(await workspaceIds()).toEqual([WORKSPACE_ID]);
    expect(await counts(WORKSPACE_ID)).toMatchObject({
      accounts: 3,
      recipients: 6,
      cards: 6,
    });
  });

  it("gives each workspace its own copy of the company with its own row ids", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW);
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, NOW);

    const mine = await listAccounts(db, WORKSPACE_ID);
    const theirs = await listAccounts(db, OTHER_WORKSPACE_ID);

    expect(theirs.map((account) => account.name)).toEqual(
      mine.map((account) => account.name),
    );
    expect(theirs.map((account) => account.balanceCents)).toEqual(
      mine.map((account) => account.balanceCents),
    );
    for (const account of theirs) {
      expect(mine.map((own) => own.id)).not.toContain(account.id);
    }
  });

  it("uses a custom seed when one is given", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW);
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, NOW, { seed: 99 });

    const [mine] = await listAccounts(db, WORKSPACE_ID);
    const [theirs] = await listAccounts(db, OTHER_WORKSPACE_ID);

    expect(theirs.balanceCents).not.toBe(mine.balanceCents);
  });

  it("sweeps out workspaces older than a week when it seeds a new one", async () => {
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, addDays(NOW, -8));

    await ensureWorkspace(db, WORKSPACE_ID, NOW);

    expect(await workspaceIds()).toEqual([WORKSPACE_ID]);
    expect(await counts(OTHER_WORKSPACE_ID)).toEqual({
      accounts: 0,
      recipients: 0,
      cards: 0,
      transactions: 0,
    });
  });

  it("keeps recent workspaces when it seeds a new one", async () => {
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, addDays(NOW, -6));

    await ensureWorkspace(db, WORKSPACE_ID, NOW);

    expect(await workspaceIds()).toEqual(
      [WORKSPACE_ID, OTHER_WORKSPACE_ID].sort(),
    );
  });

  it("does not sweep when the visitor's workspace already exists", async () => {
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, addDays(NOW, -30));
    await ensureWorkspace(db, WORKSPACE_ID, addDays(NOW, -30));

    await ensureWorkspace(db, WORKSPACE_ID, NOW);

    expect(await workspaceIds()).toEqual(
      [WORKSPACE_ID, OTHER_WORKSPACE_ID].sort(),
    );
  });
});

describe("resetWorkspace", () => {
  it("throws away the visitor's changes and restores the seeded company", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW, { newId: sequentialIds() });
    const original = await ledgerRows(db, WORKSPACE_ID);
    const [checking] = await listAccounts(db, WORKSPACE_ID);
    await db
      .update(accounts)
      .set({ balanceCents: 1 })
      .where(eq(accounts.id, checking.id));
    await db
      .delete(transactions)
      .where(eq(transactions.accountId, checking.id));
    await addAccount(db, WORKSPACE_ID, { name: "Extra account" });

    await resetWorkspace(db, WORKSPACE_ID, NOW, { newId: sequentialIds() });

    const accountsAfter = await listAccounts(db, WORKSPACE_ID);
    expect(accountsAfter.map((account) => account.name)).toEqual([
      "Operating Checking",
      "Savings Reserve",
      "Treasury",
    ]);
    expect(accountsAfter[0].balanceCents).toBe(checking.balanceCents);
    expect(await ledgerRows(db, WORKSPACE_ID)).toEqual(
      original.map((row) => ({ ...row, createdAt: expect.any(Date) })),
    );
  });

  it("reseeds as of the time of the reset", async () => {
    const firstDay = async () =>
      (await ledgerRows(db, WORKSPACE_ID))[0].postedAt
        .toISOString()
        .slice(0, 10);
    await ensureWorkspace(db, WORKSPACE_ID, addDays(NOW, -3));
    const before = await firstDay();

    await resetWorkspace(db, WORKSPACE_ID, NOW);

    // The year of history slides forward with the clock.
    const [workspace] = await db.select().from(workspaces);
    expect(workspace.createdAt).toEqual(NOW);
    expect(before).toBe("2025-06-16");
    expect(await firstDay()).toBe("2025-06-19");
  });

  it("issues fresh row ids, so stale links stop resolving", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW);
    const before = (await listAccounts(db, WORKSPACE_ID)).map(
      (account) => account.id,
    );

    await resetWorkspace(db, WORKSPACE_ID, NOW);

    const after = (await listAccounts(db, WORKSPACE_ID)).map(
      (account) => account.id,
    );
    expect(after).toHaveLength(3);
    for (const id of after) expect(before).not.toContain(id);
  });

  it("leaves other workspaces exactly as they were", async () => {
    await ensureWorkspace(db, WORKSPACE_ID, NOW);
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, NOW);
    const theirs = await ledgerRows(db, OTHER_WORKSPACE_ID);

    await resetWorkspace(db, WORKSPACE_ID, NOW);

    expect(await ledgerRows(db, OTHER_WORKSPACE_ID)).toEqual(theirs);
  });

  it("creates the workspace when there was nothing to reset", async () => {
    await resetWorkspace(db, WORKSPACE_ID, NOW);

    expect(await counts(WORKSPACE_ID)).toMatchObject({
      accounts: 3,
      recipients: 6,
      cards: 6,
    });
  });
});

describe("purgeStaleWorkspaces", () => {
  it("keeps demo workspaces for seven days", () => {
    expect(WORKSPACE_TTL_DAYS).toBe(7);
  });

  it("deletes workspaces created more than seven days ago and reports how many", async () => {
    await addWorkspace(db, WORKSPACE_ID, addDays(NOW, -8));
    await addWorkspace(db, OTHER_WORKSPACE_ID, addDays(NOW, -30));
    await addWorkspace(db, UNKNOWN_ID, addDays(NOW, -1));

    expect(await purgeStaleWorkspaces(db, NOW)).toBe(2);
    expect(await workspaceIds()).toEqual([UNKNOWN_ID]);
  });

  it("keeps a workspace that is exactly seven days old and removes one a millisecond older", async () => {
    const sevenDaysAgo = addDays(NOW, -7);
    await addWorkspace(db, WORKSPACE_ID, sevenDaysAgo);
    await addWorkspace(
      db,
      OTHER_WORKSPACE_ID,
      new Date(sevenDaysAgo.getTime() - 1),
    );

    expect(await purgeStaleWorkspaces(db, NOW)).toBe(1);
    expect(await workspaceIds()).toEqual([WORKSPACE_ID]);
  });

  it("removes everything a stale workspace owned", async () => {
    await ensureWorkspace(db, OTHER_WORKSPACE_ID, NOW);
    await ensureWorkspace(db, WORKSPACE_ID, addDays(NOW, -10));
    expect((await counts(WORKSPACE_ID)).transactions).toBeGreaterThan(800);

    expect(await purgeStaleWorkspaces(db, NOW)).toBe(1);

    expect(await counts(WORKSPACE_ID)).toEqual({
      accounts: 0,
      recipients: 0,
      cards: 0,
      transactions: 0,
    });
    expect(await counts(OTHER_WORKSPACE_ID)).toMatchObject({
      accounts: 3,
      recipients: 6,
      cards: 6,
    });
  });

  it("returns zero when nothing is stale", async () => {
    await addWorkspace(db, WORKSPACE_ID, NOW);

    expect(await purgeStaleWorkspaces(db, NOW)).toBe(0);
    expect(await workspaceIds()).toEqual([WORKSPACE_ID]);
  });
});
