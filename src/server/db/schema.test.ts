// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import {
  addAccount,
  addCard,
  addRecipient,
  addTransaction,
  addWorkspace,
  countRows,
  utc,
} from "../../../test/server-ledger";
import type { Db } from "./client";
import {
  accounts,
  cards,
  recipients,
  transactions,
  workspaces,
} from "./schema";

const tenantTables = { accounts, recipients, cards, transactions };

/** Foreign keys of a table as "column -> table.column (on delete)". */
function foreignKeys(table: PgTable): string[] {
  return getTableConfig(table)
    .foreignKeys.map((key) => {
      const { columns, foreignColumns, foreignTable } = key.reference();
      return `${columns[0].name} -> ${getTableConfig(foreignTable).name}.${foreignColumns[0].name} (${key.onDelete})`;
    })
    .sort();
}

/** Indexes of a table as "name: columns" with a "unique" marker. */
function indexes(table: PgTable): string[] {
  return getTableConfig(table)
    .indexes.map(({ config }) => {
      const columns = config.columns.map(
        (column) => (column as { name: string }).name,
      );
      return `${config.name}: ${columns.join(", ")}${config.unique ? " unique" : ""}`;
    })
    .sort();
}

describe("schema definition", () => {
  it("hangs every tenant table off its workspace with ON DELETE CASCADE", () => {
    for (const table of Object.values(tenantTables)) {
      expect(foreignKeys(table)).toContain(
        "workspace_id -> workspaces.id (cascade)",
      );
    }
  });

  it("removes cards with their account", () => {
    expect(foreignKeys(cards)).toEqual([
      "account_id -> accounts.id (cascade)",
      "workspace_id -> workspaces.id (cascade)",
    ]);
  });

  it("removes transactions with their account but only unlinks cards, recipients and counterparties", () => {
    expect(foreignKeys(transactions)).toEqual([
      "account_id -> accounts.id (cascade)",
      "card_id -> cards.id (set null)",
      "counterparty_account_id -> accounts.id (set null)",
      "recipient_id -> recipients.id (set null)",
      "workspace_id -> workspaces.id (cascade)",
    ]);
  });

  it("indexes every tenant table by workspace", () => {
    expect(indexes(accounts)).toEqual(["accounts_workspace_idx: workspace_id"]);
    expect(indexes(recipients)).toEqual([
      "recipients_workspace_idx: workspace_id",
    ]);
    expect(indexes(cards)).toEqual(["cards_workspace_idx: workspace_id"]);
  });

  it("indexes the ledger for date-ordered reads and unique idempotency keys per workspace", () => {
    expect(indexes(transactions)).toEqual([
      "transactions_account_posted_idx: account_id, posted_at",
      "transactions_idempotency_idx: workspace_id, idempotency_key unique",
      "transactions_workspace_posted_idx: workspace_id, posted_at",
    ]);
  });

  it("stores money as 64-bit integers", () => {
    expect(accounts.balanceCents.getSQLType()).toBe("bigint");
    expect(cards.monthlyLimitCents.getSQLType()).toBe("bigint");
    expect(transactions.amountCents.getSQLType()).toBe("bigint");
  });

  it("stores every timestamp with its time zone", () => {
    for (const column of [
      workspaces.createdAt,
      recipients.createdAt,
      cards.createdAt,
      transactions.postedAt,
      transactions.createdAt,
    ]) {
      expect(column.getSQLType()).toBe("timestamp with time zone");
    }
  });
});

describe("migrated database", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  /** A workspace with one of everything, linked together. */
  async function populate(workspaceId: string) {
    await addWorkspace(db, workspaceId);
    const account = await addAccount(db, workspaceId, { balanceCents: 500_00 });
    const other = await addAccount(db, workspaceId, { name: "Savings" });
    const recipient = await addRecipient(db, workspaceId);
    const card = await addCard(db, account);
    const purchase = await addTransaction(db, account, {
      postedAt: utc("2026-06-01T12:00:00"),
      amountCents: -25_00,
      cardId: card.id,
      recipientId: recipient.id,
      counterpartyAccountId: other.id,
    });
    return { account, other, recipient, card, purchase };
  }

  const reload = async (id: string) =>
    (await db.select().from(transactions).where(eq(transactions.id, id)))[0];

  const clear = () => db.delete(workspaces);

  it("has exactly the columns the schema declares, with the same nullability", async () => {
    for (const table of [workspaces, ...Object.values(tenantTables)]) {
      const config = getTableConfig(table);
      const live = await db
        .select({
          name: sql<string>`column_name`,
          nullable: sql<string>`is_nullable`,
        })
        .from(sql`information_schema.columns`)
        .where(sql`table_schema = 'public' and table_name = ${config.name}`);

      expect(
        live.map((column) => `${column.name}:${column.nullable}`).sort(),
      ).toEqual(
        config.columns
          .map((column) => `${column.name}:${column.notNull ? "NO" : "YES"}`)
          .sort(),
      );
    }
  });

  it("fills in ids, timestamps and defaults that callers leave out", async () => {
    await clear();
    await db
      .insert(workspaces)
      .values({ id: WORKSPACE_ID, companyName: "Defaults Co" });
    const [account] = await db
      .insert(accounts)
      .values({
        workspaceId: WORKSPACE_ID,
        name: "Checking",
        type: "checking",
        accountNumber: "000011112222",
        routingNumber: "111000025",
        balanceCents: 0,
      })
      .returning();
    const [recipient] = await db
      .insert(recipients)
      .values({
        workspaceId: WORKSPACE_ID,
        name: "Acme",
        bankName: "Bank",
        accountLast4: "1234",
        routingNumber: "111000025",
      })
      .returning();
    const [card] = await db
      .insert(cards)
      .values({
        workspaceId: WORKSPACE_ID,
        accountId: account.id,
        label: "Card",
        holderName: "Maya Chen",
        last4: "1111",
        type: "virtual",
        monthlyLimitCents: 100_00,
        expMonth: 1,
        expYear: 2030,
      })
      .returning();
    const [workspace] = await db.select().from(workspaces);

    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(account).toMatchObject({ apyBps: 0, sortOrder: 0 });
    expect(recipient).toMatchObject({ defaultMethod: "ach", email: null });
    expect(recipient.createdAt).toBeInstanceOf(Date);
    expect(card.status).toBe("active");
    expect(card.createdAt).toBeInstanceOf(Date);
    expect(workspace.createdAt).toBeInstanceOf(Date);
  });

  it("round-trips amounts far beyond 32 bits and instants to the millisecond", async () => {
    await clear();
    await addWorkspace(db, WORKSPACE_ID);
    const account = await addAccount(db, WORKSPACE_ID, {
      balanceCents: 9_000_000_000_00,
    });
    const postedAt = utc("2026-06-18T16:30:00.123");
    const row = await addTransaction(db, account, {
      postedAt,
      amountCents: -8_999_999_999_99,
    });

    expect(account.balanceCents).toBe(900_000_000_000);
    expect((await reload(row.id)).amountCents).toBe(-899_999_999_999);
    expect((await reload(row.id)).postedAt).toEqual(postedAt);
  });

  it("deleting a workspace removes everything it owns and nothing else", async () => {
    await clear();
    await populate(WORKSPACE_ID);
    await populate(OTHER_WORKSPACE_ID);

    await db.delete(workspaces).where(eq(workspaces.id, WORKSPACE_ID));

    for (const table of Object.values(tenantTables)) {
      expect(await countRows(db, table, WORKSPACE_ID)).toBe(0);
    }
    expect(await countRows(db, accounts, OTHER_WORKSPACE_ID)).toBe(2);
    expect(await countRows(db, recipients, OTHER_WORKSPACE_ID)).toBe(1);
    expect(await countRows(db, cards, OTHER_WORKSPACE_ID)).toBe(1);
    expect(await countRows(db, transactions, OTHER_WORKSPACE_ID)).toBe(1);
  });

  it("keeps a transaction when its card, recipient or counterparty account is deleted", async () => {
    await clear();
    const { card, recipient, other, purchase } = await populate(WORKSPACE_ID);

    await db.delete(cards).where(eq(cards.id, card.id));
    await db.delete(recipients).where(eq(recipients.id, recipient.id));
    await db.delete(accounts).where(eq(accounts.id, other.id));

    expect(await reload(purchase.id)).toMatchObject({
      id: purchase.id,
      amountCents: -25_00,
      cardId: null,
      recipientId: null,
      counterpartyAccountId: null,
    });
  });

  it("deleting an account removes its cards and transactions", async () => {
    await clear();
    const { account } = await populate(WORKSPACE_ID);

    await db.delete(accounts).where(eq(accounts.id, account.id));

    expect(await countRows(db, cards, WORKSPACE_ID)).toBe(0);
    expect(await countRows(db, transactions, WORKSPACE_ID)).toBe(0);
    expect(await countRows(db, accounts, WORKSPACE_ID)).toBe(1);
  });

  it("rejects a row for a workspace that does not exist", async () => {
    await clear();

    await expect(addAccount(db, WORKSPACE_ID)).rejects.toMatchObject({
      cause: { code: "23503" },
    });
  });

  it("rejects a second transaction with the same idempotency key in one workspace", async () => {
    await clear();
    const { account } = await populate(WORKSPACE_ID);
    const row = {
      postedAt: utc("2026-06-02T12:00:00"),
      amountCents: -1_00,
      idempotencyKey: "pay-once",
    };
    await addTransaction(db, account, row);

    await expect(addTransaction(db, account, row)).rejects.toMatchObject({
      cause: { code: "23505" },
    });
    expect(await countRows(db, transactions, WORKSPACE_ID)).toBe(2);
  });

  it("allows the same idempotency key in another workspace, and any number of rows without one", async () => {
    await clear();
    const mine = await populate(WORKSPACE_ID);
    const theirs = await populate(OTHER_WORKSPACE_ID);
    const row = { postedAt: utc("2026-06-02T12:00:00"), amountCents: -1_00 };

    await addTransaction(db, mine.account, { ...row, idempotencyKey: "k" });
    await addTransaction(db, theirs.account, { ...row, idempotencyKey: "k" });
    await addTransaction(db, mine.account, row);
    await addTransaction(db, mine.account, row);

    expect(await countRows(db, transactions, WORKSPACE_ID)).toBe(4);
    expect(await countRows(db, transactions, OTHER_WORKSPACE_ID)).toBe(2);
  });
});
