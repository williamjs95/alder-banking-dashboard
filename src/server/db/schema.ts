import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  ACCOUNT_TYPES,
  CARD_STATUSES,
  CARD_TYPES,
  CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_METHODS,
  TRANSACTION_STATUSES,
} from "@/lib/domain";

/** All money is stored as integer cents. `mode: "number"` is safe up to ~$90 trillion. */
const cents = (name: string) => bigint(name, { mode: "number" });
const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

/**
 * A workspace is one visitor's private demo company. Every other table hangs
 * off it with ON DELETE CASCADE, so resetting or purging a demo is one delete.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  companyName: text("company_name").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    accountNumber: text("account_number").notNull(),
    routingNumber: text("routing_number").notNull(),
    balanceCents: cents("balance_cents").notNull(),
    /** Annual percentage yield in basis points (460 = 4.60%). */
    apyBps: integer("apy_bps").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("accounts_workspace_idx").on(t.workspaceId)],
);

export const recipients = pgTable(
  "recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    bankName: text("bank_name").notNull(),
    accountLast4: text("account_last4").notNull(),
    routingNumber: text("routing_number").notNull(),
    defaultMethod: text("default_method", { enum: PAYMENT_METHODS })
      .notNull()
      .default("ach"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("recipients_workspace_idx").on(t.workspaceId)],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    holderName: text("holder_name").notNull(),
    last4: text("last4").notNull(),
    type: text("type", { enum: CARD_TYPES }).notNull(),
    status: text("status", { enum: CARD_STATUSES }).notNull().default("active"),
    monthlyLimitCents: cents("monthly_limit_cents").notNull(),
    expMonth: integer("exp_month").notNull(),
    expYear: integer("exp_year").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("cards_workspace_idx").on(t.workspaceId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** When the money moved, or is due to move for scheduled items. */
    postedAt: timestamptz("posted_at").notNull(),
    description: text("description").notNull(),
    /** Signed: positive is money in, negative is money out. */
    amountCents: cents("amount_cents").notNull(),
    category: text("category", { enum: CATEGORIES }).notNull(),
    method: text("method", { enum: TRANSACTION_METHODS }).notNull(),
    status: text("status", { enum: TRANSACTION_STATUSES }).notNull(),
    cardId: uuid("card_id").references(() => cards.id, {
      onDelete: "set null",
    }),
    recipientId: uuid("recipient_id").references(() => recipients.id, {
      onDelete: "set null",
    }),
    /** The other leg's account, for internal transfers. */
    counterpartyAccountId: uuid("counterparty_account_id").references(
      () => accounts.id,
      { onDelete: "set null" },
    ),
    reference: text("reference").notNull(),
    note: text("note"),
    /** When a pending transaction posts. Null for anything not pending. */
    settlesAt: timestamptz("settles_at"),
    /** Client-supplied key that makes money movement safe to retry. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("transactions_workspace_posted_idx").on(t.workspaceId, t.postedAt),
    index("transactions_account_posted_idx").on(t.accountId, t.postedAt),
    uniqueIndex("transactions_idempotency_idx").on(
      t.workspaceId,
      t.idempotencyKey,
    ),
  ],
);

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type RecipientRow = typeof recipients.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

export type NewAccountRow = typeof accounts.$inferInsert;
export type NewRecipientRow = typeof recipients.$inferInsert;
export type NewCardRow = typeof cards.$inferInsert;
export type NewTransactionRow = typeof transactions.$inferInsert;
