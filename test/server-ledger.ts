import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  accounts,
  cards,
  recipients,
  transactions,
  workspaces,
  type AccountRow,
  type CardRow,
  type NewAccountRow,
  type NewCardRow,
  type NewRecipientRow,
  type NewTransactionRow,
  type RecipientRow,
  type TransactionRow,
} from "@/server/db/schema";
import { NOW } from "./db";

/**
 * Hand-written ledger rows for server tests. The seeded demo company is
 * realistic but large; these builders make small workspaces whose totals can
 * be checked by reading the test.
 */

export const utc = (iso: string) => new Date(`${iso}Z`);

export async function addWorkspace(
  db: Db,
  id: string,
  createdAt: Date = NOW,
): Promise<void> {
  await db
    .insert(workspaces)
    .values({ id, companyName: "Test Company", createdAt });
}

export async function addAccount(
  db: Db,
  workspaceId: string,
  values: Partial<NewAccountRow> = {},
): Promise<AccountRow> {
  const [row] = await db
    .insert(accounts)
    .values({
      workspaceId,
      name: "Checking",
      type: "checking",
      accountNumber: "000011112222",
      routingNumber: "111000025",
      balanceCents: 0,
      ...values,
    })
    .returning();
  return row;
}

export async function addRecipient(
  db: Db,
  workspaceId: string,
  values: Partial<NewRecipientRow> = {},
): Promise<RecipientRow> {
  const [row] = await db
    .insert(recipients)
    .values({
      workspaceId,
      name: "Acme Supplies",
      email: "billing@acme.example",
      bankName: "First Test Bank",
      accountLast4: "4321",
      routingNumber: "111000025",
      createdAt: NOW,
      ...values,
    })
    .returning();
  return row;
}

export async function addCard(
  db: Db,
  account: Pick<AccountRow, "id" | "workspaceId">,
  values: Partial<NewCardRow> = {},
): Promise<CardRow> {
  const [row] = await db
    .insert(cards)
    .values({
      workspaceId: account.workspaceId,
      accountId: account.id,
      label: "Team card",
      holderName: "Maya Chen",
      last4: "1111",
      type: "virtual",
      monthlyLimitCents: 5_000_00,
      expMonth: 12,
      expYear: 2029,
      createdAt: NOW,
      ...values,
    })
    .returning();
  return row;
}

let referenceCounter = 0;

export async function addTransaction(
  db: Db,
  account: Pick<AccountRow, "id" | "workspaceId">,
  values: Pick<NewTransactionRow, "postedAt" | "amountCents"> &
    Partial<NewTransactionRow>,
): Promise<TransactionRow> {
  referenceCounter += 1;
  const [row] = await db
    .insert(transactions)
    .values({
      workspaceId: account.workspaceId,
      accountId: account.id,
      description: "Test merchant",
      category: "other",
      method: "ach",
      status: "posted",
      reference: `ALD-T${String(referenceCounter).padStart(7, "0")}`,
      ...values,
    })
    .returning();
  return row;
}

export async function balanceOf(db: Db, accountId: string): Promise<number> {
  const [row] = await db
    .select({ balanceCents: accounts.balanceCents })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row.balanceCents;
}

/** Every ledger row of a workspace, oldest first, straight from the table. */
export function ledgerRows(
  db: Db,
  workspaceId: string,
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId))
    .orderBy(asc(transactions.postedAt), asc(transactions.id));
}

export async function countRows(
  db: Db,
  table:
    typeof accounts | typeof cards | typeof recipients | typeof transactions,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(eq(table.workspaceId, workspaceId));
  return row.count;
}

export type Ledger = Awaited<ReturnType<typeof seedLedger>>;

/**
 * A small company as of `NOW` (2026-06-18 16:30 UTC). Balances: Checking
 * $100,000, Savings $50,000. Amounts below are cents.
 *
 * | key          | when (UTC)          | account  | cents     | category  | status    |
 * | ------------ | ------------------- | -------- | --------- | --------- | --------- |
 * | stripeToday  | Jun 18 10:00        | checking |  +50,000  | revenue   | posted    |
 * | awsToday     | Jun 18 00:00:00     | checking |  -12,000  | cloud     | pending   | cloud card
 * | slack        | Jun 17 23:59:59     | checking |   -8,000  | software  | posted    | software card
 * | transferOut  | Jun 16 09:00        | checking | -100,000  | transfer  | posted    |
 * | transferIn   | Jun 16 09:00        | savings  | +100,000  | transfer  | posted    |
 * | failed       | Jun 15 09:00        | checking |  -30,000  | services  | failed    |
 * | scheduled    | Jun 25 15:00        | checking |  -90,000  | payroll   | scheduled |
 * | notion       | Jun 01 00:00:00     | checking |   -8,000  | software  | posted    | software card
 * | figma        | May 31 23:59:59     | checking |   -4,000  | software  | posted    | software card
 * | awsMay       | May 20 12:00        | checking |  -20,000  | cloud     | posted    | cloud card
 * | stripeMay    | May 19 16:30:00     | checking |  +40,000  | revenue   | posted    | exactly 30 days before NOW
 * | googleAds    | May 10 12:00        | checking |  -15,000  | marketing | posted    |
 * | vercel       | May 05 12:00        | checking |   -5,000  | cloud     | posted    |
 * | wework       | Mar 03 12:00        | checking |  -70,000  | rent      | posted    |
 * | northgate    | Feb 10 12:00        | checking | +200,000  | revenue   | posted    |
 *
 * April has no activity on purpose.
 */
export async function seedLedger(db: Db, workspaceId: string) {
  await addWorkspace(db, workspaceId);
  const checking = await addAccount(db, workspaceId, {
    name: "Checking",
    type: "checking",
    accountNumber: "100000004821",
    balanceCents: 100_000_00,
    sortOrder: 0,
  });
  const savings = await addAccount(db, workspaceId, {
    name: "Savings",
    type: "savings",
    accountNumber: "100000007730",
    balanceCents: 50_000_00,
    apyBps: 390,
    sortOrder: 1,
  });
  const recipient = await addRecipient(db, workspaceId);
  const cloudCard = await addCard(db, checking, {
    label: "Cloud",
    last4: "4417",
    createdAt: utc("2026-01-01T00:00:00"),
  });
  const softwareCard = await addCard(db, checking, {
    label: "Software",
    last4: "8203",
    createdAt: utc("2026-02-01T00:00:00"),
  });
  const frozenCard = await addCard(db, checking, {
    label: "Events",
    last4: "1186",
    status: "frozen",
    createdAt: utc("2026-03-01T00:00:00"),
  });

  const tx = {
    stripeToday: await addTransaction(db, checking, {
      postedAt: utc("2026-06-18T10:00:00"),
      amountCents: 50_000,
      description: "Stripe",
      category: "revenue",
    }),
    awsToday: await addTransaction(db, checking, {
      postedAt: utc("2026-06-18T00:00:00"),
      amountCents: -12_000,
      description: "Amazon Web Services",
      category: "cloud",
      method: "card",
      status: "pending",
      cardId: cloudCard.id,
    }),
    slack: await addTransaction(db, checking, {
      postedAt: utc("2026-06-17T23:59:59"),
      amountCents: -8_000,
      description: "Slack",
      category: "software",
      method: "card",
      cardId: softwareCard.id,
    }),
    transferOut: await addTransaction(db, checking, {
      postedAt: utc("2026-06-16T09:00:00"),
      amountCents: -100_000,
      description: "Transfer to Savings",
      category: "transfer",
      method: "transfer",
      counterpartyAccountId: savings.id,
    }),
    transferIn: await addTransaction(db, savings, {
      postedAt: utc("2026-06-16T09:00:00"),
      amountCents: 100_000,
      description: "Transfer from Checking",
      category: "transfer",
      method: "transfer",
      counterpartyAccountId: checking.id,
    }),
    failed: await addTransaction(db, checking, {
      postedAt: utc("2026-06-15T09:00:00"),
      amountCents: -30_000,
      description: "Hartwell Staffing",
      category: "services",
      status: "failed",
      recipientId: recipient.id,
      note: "Returned by receiving bank",
    }),
    scheduled: await addTransaction(db, checking, {
      postedAt: utc("2026-06-25T15:00:00"),
      amountCents: -90_000,
      description: "Gusto Payroll",
      category: "payroll",
      status: "scheduled",
    }),
    notion: await addTransaction(db, checking, {
      postedAt: utc("2026-06-01T00:00:00"),
      amountCents: -8_000,
      description: "Notion",
      category: "software",
      method: "card",
      cardId: softwareCard.id,
    }),
    figma: await addTransaction(db, checking, {
      postedAt: utc("2026-05-31T23:59:59"),
      amountCents: -4_000,
      description: "Figma",
      category: "software",
      method: "card",
      cardId: softwareCard.id,
    }),
    awsMay: await addTransaction(db, checking, {
      postedAt: utc("2026-05-20T12:00:00"),
      amountCents: -20_000,
      description: "Amazon Web Services",
      category: "cloud",
      method: "card",
      cardId: cloudCard.id,
    }),
    stripeMay: await addTransaction(db, checking, {
      postedAt: utc("2026-05-19T16:30:00"),
      amountCents: 40_000,
      description: "Stripe",
      category: "revenue",
    }),
    googleAds: await addTransaction(db, checking, {
      postedAt: utc("2026-05-10T12:00:00"),
      amountCents: -15_000,
      description: "Google Ads",
      category: "marketing",
    }),
    vercel: await addTransaction(db, checking, {
      postedAt: utc("2026-05-05T12:00:00"),
      amountCents: -5_000,
      description: "Vercel",
      category: "cloud",
    }),
    wework: await addTransaction(db, checking, {
      postedAt: utc("2026-03-03T12:00:00"),
      amountCents: -70_000,
      description: "WeWork",
      category: "rent",
    }),
    northgate: await addTransaction(db, checking, {
      postedAt: utc("2026-02-10T12:00:00"),
      amountCents: 200_000,
      description: "Northgate Health",
      category: "revenue",
      method: "wire",
    }),
  };

  return {
    workspaceId,
    checking,
    savings,
    recipient,
    cloudCard,
    softwareCard,
    frozenCard,
    tx,
  };
}

/**
 * A second tenant in the same database whose figures would be obvious if they
 * leaked into the first: a large balance and a large cloud bill dated today.
 */
export async function seedNeighbour(db: Db, workspaceId: string) {
  await addWorkspace(db, workspaceId);
  const account = await addAccount(db, workspaceId, {
    name: "Neighbour Checking",
    accountNumber: "999999990000",
    balanceCents: 9_000_000_00,
  });
  const recipient = await addRecipient(db, workspaceId, {
    name: "Neighbour Vendor",
  });
  const card = await addCard(db, account, { label: "Neighbour card" });
  const transaction = await addTransaction(db, account, {
    postedAt: utc("2026-06-18T12:00:00"),
    amountCents: -7_777_00,
    description: "Neighbour Cloud",
    category: "cloud",
    method: "card",
    cardId: card.id,
    idempotencyKey: "neighbour-key",
  });
  return { workspaceId, account, recipient, card, transaction };
}
