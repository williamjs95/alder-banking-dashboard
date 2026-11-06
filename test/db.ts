import { createEmbeddedDb, type Db } from "@/server/db/client";
import { createRng } from "@/server/seed/prng";
import { ensureWorkspace } from "@/server/services/workspace";

/** A fixed "now" so seeded data and date math are identical on every run. */
export const NOW = new Date("2026-06-18T16:30:00.000Z");
export const WORKSPACE_ID = "0b3f6a52-7c1d-4e8a-9f20-5d6c7b8a9e01";
export const OTHER_WORKSPACE_ID = "7e2d4c11-9a8b-4f3e-8d77-1c2b3a4f5e66";

/** A fresh in-memory Postgres with the schema applied. */
export function createTestDb(): Promise<Db> {
  return createEmbeddedDb("memory://");
}

/** Deterministic ids so a failing assertion reads the same on every run. */
export function sequentialIds(seed = 7): () => string {
  const rng = createRng(seed);
  return () => rng.uuid();
}

/** A database holding one seeded workspace. */
export async function createSeededDb(
  workspaceId = WORKSPACE_ID,
  now = NOW,
): Promise<Db> {
  const db = await createTestDb();
  await ensureWorkspace(db, workspaceId, now, { newId: sequentialIds() });
  return db;
}
