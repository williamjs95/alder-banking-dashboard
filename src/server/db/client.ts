import "server-only";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Driver-agnostic database handle. Production talks to Postgres (Neon) through
 * `pg`; local development and tests use PGlite, a real Postgres compiled to
 * WASM that runs in-process. Both speak the same dialect, so the schema,
 * migrations and every query are shared.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A `Db` or a transaction handle; services accept either. */
export type DbExecutor = Pick<
  Db,
  "select" | "insert" | "update" | "delete" | "execute"
>;

export const MIGRATIONS_FOLDER = "drizzle";

export type DbEnv = {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  /** Opt in to the embedded database outside development (used by e2e runs). */
  ALDER_EMBEDDED_DB?: string;
  /** PGlite data dir. Use "memory://" for an ephemeral database. */
  PGLITE_DIR?: string;
};

/**
 * Hosts such as Neon hand out URLs with `sslmode=require`. Today `pg` treats
 * that as `verify-full`, but from pg 9 it will stop checking the server's
 * certificate. Naming `verify-full` keeps that protection across the upgrade.
 */
export function withVerifiedSsl(connectionString: string): string {
  return connectionString.replace(
    /([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/,
    "$1verify-full",
  );
}

export async function createPostgresDb(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: withVerifiedSsl(connectionString),
    max: 5,
  });
  return drizzle(pool, { schema });
}

export async function createEmbeddedDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir && !dataDir.includes("://")) {
    // PGlite creates its data directory but not the folders above it.
    const { mkdirSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    mkdirSync(dirname(resolve(dataDir)), { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export function createDb(env: DbEnv): Promise<Db> {
  if (env.DATABASE_URL) return createPostgresDb(env.DATABASE_URL);

  if (env.NODE_ENV === "production" && env.ALDER_EMBEDDED_DB !== "1") {
    return Promise.reject(
      new Error(
        "DATABASE_URL is not set. Production needs a Postgres connection string " +
          "(set ALDER_EMBEDDED_DB=1 to run on the embedded database instead).",
      ),
    );
  }

  const fallbackDir = env.NODE_ENV === "test" ? "memory://" : ".data/pglite";
  return createEmbeddedDb(env.PGLITE_DIR ?? fallbackDir);
}

const globalForDb = globalThis as typeof globalThis & {
  __alderDb?: Promise<Db>;
};

/**
 * One database handle per server process. Cached on `globalThis` so dev-mode
 * hot reloads do not open a new pool (or a second PGlite instance) each time.
 */
export function getDb(): Promise<Db> {
  globalForDb.__alderDb ??= createDb(process.env).catch((error) => {
    globalForDb.__alderDb = undefined;
    throw error;
  });
  return globalForDb.__alderDb;
}
