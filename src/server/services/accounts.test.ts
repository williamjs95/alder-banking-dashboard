// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  addAccount,
  addWorkspace,
  seedLedger,
  seedNeighbour,
  type Ledger,
} from "../../../test/server-ledger";
import type { Db } from "@/server/db/client";
import {
  getAccountDetail,
  getAccountNumbers,
  getAccountRow,
  listAccountRows,
  listAccounts,
  toAccountDto,
} from "./accounts";

// See test/server-ledger.ts for the rows these figures are derived from.
let db: Db;
let ledger: Ledger;
let neighbour: Awaited<ReturnType<typeof seedNeighbour>>;

const notFound = {
  code: "not_found",
  status: 404,
  message: "Account was not found.",
};

beforeAll(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
  neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
});

describe("toAccountDto", () => {
  it("exposes only the last four digits of the account number", () => {
    expect(
      toAccountDto({
        id: UNKNOWN_ID,
        workspaceId: WORKSPACE_ID,
        name: "Operating Checking",
        type: "checking",
        accountNumber: "202418874821",
        routingNumber: "114924742",
        balanceCents: 123_45,
        apyBps: 0,
        sortOrder: 0,
      }),
    ).toEqual({
      id: UNKNOWN_ID,
      name: "Operating Checking",
      type: "checking",
      last4: "4821",
      balanceCents: 123_45,
      apyBps: 0,
    });
  });
});

describe("listAccounts", () => {
  it("returns the workspace's accounts without full account or routing numbers", async () => {
    expect(await listAccounts(db, WORKSPACE_ID)).toEqual([
      {
        id: ledger.checking.id,
        name: "Checking",
        type: "checking",
        last4: "4821",
        balanceCents: 10_000_000,
        apyBps: 0,
      },
      {
        id: ledger.savings.id,
        name: "Savings",
        type: "savings",
        last4: "7730",
        balanceCents: 5_000_000,
        apyBps: 390,
      },
    ]);
  });

  it("orders by display position, then by name", async () => {
    const workspaceId = randomUUID();
    await addWorkspace(db, workspaceId);
    await addAccount(db, workspaceId, { name: "Zeta", sortOrder: 1 });
    await addAccount(db, workspaceId, { name: "Treasury", sortOrder: 2 });
    await addAccount(db, workspaceId, { name: "Alpha", sortOrder: 1 });
    await addAccount(db, workspaceId, { name: "Main", sortOrder: 0 });

    expect(
      (await listAccounts(db, workspaceId)).map((account) => account.name),
    ).toEqual(["Main", "Alpha", "Zeta", "Treasury"]);
  });

  it("shows each workspace only its own accounts", async () => {
    expect(
      (await listAccounts(db, OTHER_WORKSPACE_ID)).map(
        (account) => account.name,
      ),
    ).toEqual(["Neighbour Checking"]);
    expect(await listAccounts(db, UNKNOWN_ID)).toEqual([]);
  });
});

describe("listAccountRows", () => {
  it("returns full rows for server-side use", async () => {
    const rows = await listAccountRows(db, WORKSPACE_ID);

    expect(rows.map((row) => row.accountNumber)).toEqual([
      "100000004821",
      "100000007730",
    ]);
    expect(rows.every((row) => row.workspaceId === WORKSPACE_ID)).toBe(true);
  });
});

describe("getAccountRow", () => {
  it("returns the account", async () => {
    expect(await getAccountRow(db, WORKSPACE_ID, ledger.savings.id)).toEqual(
      ledger.savings,
    );
  });

  it("reports an unknown id as not found", async () => {
    await expect(
      getAccountRow(db, WORKSPACE_ID, UNKNOWN_ID),
    ).rejects.toMatchObject(notFound);
  });

  it("reports another workspace's account as not found", async () => {
    await expect(
      getAccountRow(db, WORKSPACE_ID, neighbour.account.id),
    ).rejects.toMatchObject(notFound);
    await expect(
      getAccountRow(db, OTHER_WORKSPACE_ID, ledger.checking.id),
    ).rejects.toMatchObject(notFound);
  });
});

describe("getAccountDetail", () => {
  it("returns the account with a year of daily balances ending at today's balance", async () => {
    const detail = await getAccountDetail(
      db,
      WORKSPACE_ID,
      ledger.checking.id,
      NOW,
    );

    expect(detail.account).toEqual({
      id: ledger.checking.id,
      name: "Checking",
      type: "checking",
      last4: "4821",
      balanceCents: 10_000_000,
      apyBps: 0,
    });
    expect(detail.balanceSeries).toHaveLength(365);
    expect(detail.balanceSeries[0].date).toBe("2025-06-19");
    expect(detail.balanceSeries.slice(-5)).toEqual([
      { date: "2026-06-14", balanceCents: 10_070_000 },
      { date: "2026-06-15", balanceCents: 10_070_000 },
      { date: "2026-06-16", balanceCents: 9_970_000 },
      { date: "2026-06-17", balanceCents: 9_962_000 },
      { date: "2026-06-18", balanceCents: 10_000_000 },
    ]);
  });

  it("totals the account's last 30 days, counting transfers as real movements", async () => {
    const checking = await getAccountDetail(
      db,
      WORKSPACE_ID,
      ledger.checking.id,
      NOW,
    );
    const savings = await getAccountDetail(
      db,
      WORKSPACE_ID,
      ledger.savings.id,
      NOW,
    );

    expect(checking.last30Days).toEqual({
      inflowCents: 90_000,
      outflowCents: 152_000,
    });
    expect(savings.last30Days).toEqual({
      inflowCents: 100_000,
      outflowCents: 0,
    });
  });

  it("reports an unknown or foreign account as not found", async () => {
    await expect(
      getAccountDetail(db, WORKSPACE_ID, UNKNOWN_ID, NOW),
    ).rejects.toMatchObject(notFound);
    await expect(
      getAccountDetail(db, WORKSPACE_ID, neighbour.account.id, NOW),
    ).rejects.toMatchObject(notFound);
  });
});

describe("getAccountNumbers", () => {
  it("reveals the full account and routing numbers", async () => {
    expect(
      await getAccountNumbers(db, WORKSPACE_ID, ledger.checking.id),
    ).toEqual({ accountNumber: "100000004821", routingNumber: "111000025" });
  });

  it("never reveals another workspace's numbers", async () => {
    await expect(
      getAccountNumbers(db, WORKSPACE_ID, neighbour.account.id),
    ).rejects.toMatchObject(notFound);
    await expect(
      getAccountNumbers(db, WORKSPACE_ID, UNKNOWN_ID),
    ).rejects.toMatchObject(notFound);
  });
});
