// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDb,
  createEmbeddedDb,
  createPostgresDb,
  getDb,
  type Db,
} from "./client";
import { workspaces } from "./schema";

/** Every data directory PGlite was asked to open, in order. */
const opened = vi.hoisted(() => [] as (string | undefined)[]);

// Records where PGlite is pointed. The one redirect keeps the development
// default (`.data/pglite`, the real dev database) from being opened by a test.
vi.mock("@electric-sql/pglite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@electric-sql/pglite")>();
  class RecordingPGlite extends actual.PGlite {
    constructor(dataDir?: string) {
      opened.push(dataDir);
      super(dataDir === ".data/pglite" ? "memory://" : dataDir);
    }
  }
  return { ...actual, PGlite: RecordingPGlite };
});

const POSTGRES_URL = "postgres://alder:secret@db.invalid:5432/alder";
const WORKSPACE = "0b3f6a52-7c1d-4e8a-9f20-5d6c7b8a9e01";

type Closable = { $client: { close(): Promise<void> } };
const poolOf = (db: Db) => (db as unknown as { $client: Pool }).$client;
const close = (db: Db) => (db as unknown as Closable).$client.close();

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db
    .select({ name: sql<string>`table_name` })
    .from(sql`information_schema.tables`)
    .where(sql`table_schema = 'public'`)
    .orderBy(sql`table_name`);
  return rows.map((row) => row.name);
}

const cache = globalThis as { __alderDb?: Promise<Db> };

beforeEach(() => {
  opened.length = 0;
  cache.__alderDb = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  cache.__alderDb = undefined;
});

describe("createPostgresDb", () => {
  it("builds a small connection pool for the URL without connecting yet", async () => {
    const db = await createPostgresDb(POSTGRES_URL);
    const pool = poolOf(db);

    expect(pool).toBeInstanceOf(Pool);
    expect(pool.options.connectionString).toBe(POSTGRES_URL);
    expect(pool.options.max).toBe(5);
    expect(pool.totalCount).toBe(0);
    expect(typeof db.select).toBe("function");
    expect(typeof db.transaction).toBe("function");

    await pool.end();
  });
});

describe("createEmbeddedDb", () => {
  it("applies the migrations, so every table exists", async () => {
    const db = await createEmbeddedDb("memory://");

    expect(await tableNames(db)).toEqual([
      "accounts",
      "cards",
      "recipients",
      "transactions",
      "workspaces",
    ]);
  });

  it("runs in memory when no data directory is given", async () => {
    const db = await createEmbeddedDb();

    expect(opened).toEqual([undefined]);
    expect(await db.select().from(workspaces)).toEqual([]);
  });

  it("keeps separate in-memory databases apart", async () => {
    const first = await createEmbeddedDb("memory://");
    const second = await createEmbeddedDb("memory://");

    await first
      .insert(workspaces)
      .values({ id: WORKSPACE, companyName: "Only in the first" });

    expect(await first.select().from(workspaces)).toHaveLength(1);
    expect(await second.select().from(workspaces)).toEqual([]);
  });

  it("creates missing parent folders and persists data on disk", async () => {
    const root = join(tmpdir(), `alder-client-test-${randomUUID()}`);
    const dataDir = join(root, "deeply", "nested", "pglite");
    try {
      expect(existsSync(root)).toBe(false);

      const db = await createEmbeddedDb(dataDir);
      await db
        .insert(workspaces)
        .values({ id: WORKSPACE, companyName: "Persisted Co" });
      await close(db);

      expect(existsSync(dirname(dataDir))).toBe(true);
      expect(existsSync(dataDir)).toBe(true);

      const reopened = await createEmbeddedDb(dataDir);
      const rows = await reopened.select().from(workspaces);
      await close(reopened);

      expect(rows.map((row) => row.companyName)).toEqual(["Persisted Co"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("createDb", () => {
  it("uses Postgres whenever DATABASE_URL is set", async () => {
    const db = await createDb({
      DATABASE_URL: POSTGRES_URL,
      NODE_ENV: "production",
      ALDER_EMBEDDED_DB: "1",
    });

    expect(poolOf(db)).toBeInstanceOf(Pool);
    expect(poolOf(db).options.connectionString).toBe(POSTGRES_URL);
    expect(opened).toEqual([]);

    await poolOf(db).end();
  });

  it("refuses to start in production without a connection string", async () => {
    await expect(createDb({ NODE_ENV: "production" })).rejects.toThrow(
      "DATABASE_URL is not set. Production needs a Postgres connection string " +
        "(set ALDER_EMBEDDED_DB=1 to run on the embedded database instead).",
    );
    expect(opened).toEqual([]);
  });

  it("accepts only the exact opt-in value for the embedded database in production", async () => {
    await expect(
      createDb({ NODE_ENV: "production", ALDER_EMBEDDED_DB: "true" }),
    ).rejects.toThrow("DATABASE_URL is not set");
    expect(opened).toEqual([]);
  });

  it("runs production on the embedded database when ALDER_EMBEDDED_DB=1", async () => {
    const db = await createDb({
      NODE_ENV: "production",
      ALDER_EMBEDDED_DB: "1",
      PGLITE_DIR: "memory://",
    });

    expect(opened).toEqual(["memory://"]);
    expect(await tableNames(db)).toContain("transactions");
  });

  it("uses a throwaway in-memory database under test", async () => {
    const db = await createDb({ NODE_ENV: "test" });

    expect(opened).toEqual(["memory://"]);
    expect(await db.select().from(workspaces)).toEqual([]);
  });

  it("keeps development data in .data/pglite", async () => {
    await createDb({ NODE_ENV: "development" });
    await createDb({});

    expect(opened).toEqual([".data/pglite", ".data/pglite"]);
  });

  it("lets PGLITE_DIR override the default location in any environment", async () => {
    await createDb({ NODE_ENV: "development", PGLITE_DIR: "memory://dev" });
    await createDb({ NODE_ENV: "test", PGLITE_DIR: "memory://test" });

    expect(opened).toEqual(["memory://dev", "memory://test"]);
  });
});

describe("getDb", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGLITE_DIR", "memory://");
    vi.stubEnv("ALDER_EMBEDDED_DB", "");
  });

  it("opens the database once and hands every caller the same handle", async () => {
    const first = getDb();
    const second = getDb();

    expect(second).toBe(first);
    expect(await second).toBe(await first);
    expect(opened).toEqual(["memory://"]);

    const db = await getDb();
    await db
      .insert(workspaces)
      .values({ id: WORKSPACE, companyName: "Shared handle" });
    expect(await (await getDb()).select().from(workspaces)).toHaveLength(1);
  });

  it("reads its configuration from the process environment", async () => {
    vi.stubEnv("DATABASE_URL", POSTGRES_URL);

    const db = await getDb();

    expect(poolOf(db).options.connectionString).toBe(POSTGRES_URL);
    expect(opened).toEqual([]);
    await poolOf(db).end();
  });

  it("forgets a failed attempt, so the next request can try again", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const failed = getDb();
    await expect(failed).rejects.toThrow("DATABASE_URL is not set");
    expect(cache.__alderDb).toBeUndefined();

    vi.stubEnv("NODE_ENV", "test");
    const recovered = getDb();

    expect(recovered).not.toBe(failed);
    expect(await tableNames(await recovered)).toContain("workspaces");
    expect(getDb()).toBe(recovered);
  });
});
