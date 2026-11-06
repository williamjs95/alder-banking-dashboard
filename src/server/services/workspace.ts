import { eq, lt } from "drizzle-orm";
import { addDays } from "@/lib/dates";
import type { Db } from "@/server/db/client";
import {
  accounts,
  cards,
  recipients,
  transactions,
  workspaces,
} from "@/server/db/schema";
import { generateSeed, type SeedOptions } from "@/server/seed/generator";

/** Demo workspaces are disposable. Old ones are swept so the database stays small. */
export const WORKSPACE_TTL_DAYS = 7;
const INSERT_CHUNK = 400;

export type SeedOverrides = Pick<SeedOptions, "seed" | "newId">;

/**
 * Makes sure the visitor's workspace exists, creating and seeding it on first
 * sight. Safe to call on every request and under concurrency: the workspace
 * row and its data are written in one transaction, and a second request that
 * loses the insert race waits for the winner's commit and then finds the data.
 */
export async function ensureWorkspace(
  db: Db,
  workspaceId: string,
  now: Date,
  overrides: SeedOverrides = {},
): Promise<void> {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (existing) return;

  const seed = generateSeed({ workspaceId, now, ...overrides });

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(workspaces)
      .values(seed.workspace)
      .onConflictDoNothing()
      .returning({ id: workspaces.id });
    if (inserted.length === 0) return;

    await tx.insert(accounts).values(seed.accounts);
    await tx.insert(recipients).values(seed.recipients);
    await tx.insert(cards).values(seed.cards);
    for (let i = 0; i < seed.transactions.length; i += INSERT_CHUNK) {
      await tx
        .insert(transactions)
        .values(seed.transactions.slice(i, i + INSERT_CHUNK));
    }
  });

  await purgeStaleWorkspaces(db, now);
}

/** Throws the visitor's data away and seeds a fresh copy. */
export async function resetWorkspace(
  db: Db,
  workspaceId: string,
  now: Date,
  overrides: SeedOverrides = {},
): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await ensureWorkspace(db, workspaceId, now, overrides);
}

/** Deletes workspaces past their TTL. Child rows go with them via cascade. */
export async function purgeStaleWorkspaces(db: Db, now: Date): Promise<number> {
  const removed = await db
    .delete(workspaces)
    .where(lt(workspaces.createdAt, addDays(now, -WORKSPACE_TTL_DAYS)))
    .returning({ id: workspaces.id });
  return removed.length;
}
