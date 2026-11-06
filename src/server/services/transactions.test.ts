// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import {
  addAccount,
  addTransaction,
  addWorkspace,
  ledgerRows,
  seedLedger,
  seedNeighbour,
  utc,
  type Ledger,
} from "../../../test/server-ledger";
import {
  transactionFiltersSchema,
  type TransactionDto,
  type TransactionFiltersInput,
} from "@/lib/contracts";
import { addDays } from "@/lib/dates";
import type { Db } from "@/server/db/client";
import { transactions, workspaces } from "@/server/db/schema";
import {
  EXPORT_LIMIT,
  exportTransactions,
  findByIdempotencyKey,
  findLargestExpense,
  getTransaction,
  listRecent,
  listTransactions,
  listUpcoming,
  updateTransaction,
} from "./transactions";

// See test/server-ledger.ts for the fifteen rows these tests search through.
let db: Db;
let ledger: Ledger;
let neighbour: Awaited<ReturnType<typeof seedNeighbour>>;

/** Filters as the API hands them to the service: parsed query-string values. */
const filters = (query: TransactionFiltersInput = {}) =>
  transactionFiltersSchema.parse(query);

const list = (query: TransactionFiltersInput = {}) =>
  listTransactions(db, WORKSPACE_ID, filters(query));

const descriptions = (items: TransactionDto[]) =>
  items.map((item) => item.description);

const found = async (query: TransactionFiltersInput) =>
  descriptions((await list(query)).items);

const notFound = {
  code: "not_found",
  status: 404,
  message: "Transaction was not found.",
};

beforeAll(async () => {
  db = await createTestDb();
  ledger = await seedLedger(db, WORKSPACE_ID);
  neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
});

describe("listTransactions", () => {
  describe("defaults", () => {
    it("returns the first 25 rows, newest first, with totals over every match", async () => {
      const result = await list();

      expect(result).toMatchObject({
        total: 15,
        page: 1,
        pageSize: 25,
        pageCount: 1,
        // In: 50,000 + 100,000 + 40,000 + 200,000. Out: everything negative
        // except the failed Hartwell payment, which never moved money.
        summary: {
          inflowCents: 390_000,
          outflowCents: 332_000,
          netCents: 58_000,
        },
      });
      expect(
        descriptions(result.items).map((name) =>
          name.startsWith("Transfer") ? "Transfer" : name,
        ),
      ).toEqual([
        "Gusto Payroll",
        "Stripe",
        "Amazon Web Services",
        "Slack",
        "Transfer",
        "Transfer",
        "Hartwell Staffing",
        "Notion",
        "Figma",
        "Amazon Web Services",
        "Stripe",
        "Google Ads",
        "Vercel",
        "WeWork",
        "Northgate Health",
      ]);
    });

    it("describes a card purchase with its account and card", async () => {
      const [aws] = (await list({ cardId: ledger.cloudCard.id })).items;

      expect(aws).toEqual({
        id: ledger.tx.awsToday.id,
        accountId: ledger.checking.id,
        accountName: "Checking",
        postedAt: "2026-06-18T00:00:00.000Z",
        description: "Amazon Web Services",
        amountCents: -12_000,
        category: "cloud",
        method: "card",
        status: "pending",
        reference: ledger.tx.awsToday.reference,
        note: null,
        cardId: ledger.cloudCard.id,
        cardLabel: "Cloud",
        cardLast4: "4417",
        recipientId: null,
        counterpartyAccountName: null,
      });
    });

    it("names the other account on both legs of a transfer", async () => {
      const legs = (await list({ category: "transfer" })).items;

      expect(
        legs.map((leg) => [
          leg.description,
          leg.accountName,
          leg.counterpartyAccountName,
          leg.amountCents,
        ]),
      ).toEqual(
        expect.arrayContaining([
          ["Transfer to Savings", "Checking", "Savings", -100_000],
          ["Transfer from Checking", "Savings", "Checking", 100_000],
        ]),
      );
      expect(legs).toHaveLength(2);
    });
  });

  describe("search", () => {
    it("matches the description, ignoring case", async () => {
      expect(await found({ q: "amazon" })).toEqual([
        "Amazon Web Services",
        "Amazon Web Services",
      ]);
      expect(await found({ q: "STRIPE" })).toEqual(["Stripe", "Stripe"]);
    });

    it("matches part of the reference", async () => {
      expect(
        await found({ q: ledger.tx.wework.reference.toLowerCase() }),
      ).toEqual(["WeWork"]);
    });

    it("matches the note", async () => {
      expect(await found({ q: "receiving bank" })).toEqual([
        "Hartwell Staffing",
      ]);
    });

    it.each(["$700.00", "700", "700.0", " 700 ", "-700.00"])(
      "matches the amount typed as %j, whichever way the money moved",
      async (q) => {
        expect(await found({ q })).toEqual(["WeWork"]);
      },
    );

    it("matches an amount with thousands separators on both legs of a transfer", async () => {
      expect((await found({ q: "$1,000.00" })).sort()).toEqual([
        "Transfer from Checking",
        "Transfer to Savings",
      ]);
    });

    it("does not treat text that merely contains digits as an amount", async () => {
      expect(await found({ q: "700 dollars" })).toEqual([]);
      expect(await found({ q: "700.123" })).toEqual([]);
    });

    it.each([
      "99999999999999999",
      "99999999999999999999",
      "123456789012345678901234567890.12",
    ])(
      "searches the digit string %s as text rather than as an impossible amount",
      async (q) => {
        expect(await list({ q })).toMatchObject({ total: 0, items: [] });
      },
    );

    it("finds a long number that appears in a note", async () => {
      const workspaceId = randomUUID();
      await addWorkspace(db, workspaceId);
      const account = await addAccount(db, workspaceId);
      await addTransaction(db, account, {
        postedAt: utc("2026-06-01T12:00:00"),
        amountCents: -45_00,
        description: "Courier",
        note: "Tracking 940011189922385742",
      });

      const result = await listTransactions(
        db,
        workspaceId,
        filters({ q: "940011189922385742" }),
      );

      expect(descriptions(result.items)).toEqual(["Courier"]);
    });

    it.each(["%", "_", "\\"])(
      "treats the wildcard character %j literally",
      async (q) => {
        expect((await list({ q })).total).toBe(0);
      },
    );
  });

  describe("filters", () => {
    it("filters by account", async () => {
      expect(await found({ accountId: ledger.savings.id })).toEqual([
        "Transfer from Checking",
      ]);
    });

    it("filters by card", async () => {
      expect(await found({ cardId: ledger.softwareCard.id })).toEqual([
        "Slack",
        "Notion",
        "Figma",
      ]);
    });

    it("filters by one or several categories", async () => {
      expect(await found({ category: "rent" })).toEqual(["WeWork"]);
      expect(await found({ category: "cloud,marketing" })).toEqual([
        "Amazon Web Services",
        "Amazon Web Services",
        "Google Ads",
        "Vercel",
      ]);
    });

    it("filters by one or several statuses", async () => {
      expect(await found({ status: "failed" })).toEqual(["Hartwell Staffing"]);
      expect(await found({ status: "pending,scheduled" })).toEqual([
        "Gusto Payroll",
        "Amazon Web Services",
      ]);
      expect((await list({ status: "posted" })).total).toBe(12);
    });

    it("treats an empty category or status list as no filter", async () => {
      expect((await list({ category: "", status: "" })).total).toBe(15);
    });

    it("filters by direction", async () => {
      expect(await found({ direction: "in" })).toEqual([
        "Stripe",
        "Transfer from Checking",
        "Stripe",
        "Northgate Health",
      ]);
      expect((await list({ direction: "out" })).total).toBe(11);
    });

    it("includes the whole first and last day of a date range", async () => {
      // Notion is at 00:00:00 on Jun 1 and Slack at 23:59:59 on Jun 17;
      // Figma (May 31 23:59:59) and AWS (Jun 18 00:00:00) sit just outside.
      const names = await found({ from: "2026-06-01", to: "2026-06-17" });

      expect(names).toHaveLength(5);
      expect(names[0]).toBe("Slack");
      expect(names.at(-1)).toBe("Notion");
      expect(names).not.toContain("Figma");
      expect(names).not.toContain("Amazon Web Services");
    });

    it("accepts an open-ended date range in either direction", async () => {
      expect(await found({ from: "2026-06-18" })).toEqual([
        "Gusto Payroll",
        "Stripe",
        "Amazon Web Services",
      ]);
      expect(await found({ to: "2026-03-03" })).toEqual([
        "WeWork",
        "Northgate Health",
      ]);
    });

    it("bounds the absolute amount, so it applies to money in and out alike", async () => {
      expect((await found({ minCents: "70000" })).sort()).toEqual([
        "Gusto Payroll",
        "Northgate Health",
        "Transfer from Checking",
        "Transfer to Savings",
        "WeWork",
      ]);
      expect(await found({ maxCents: "5000" })).toEqual(["Figma", "Vercel"]);
      expect(await found({ minCents: "8000", maxCents: "12000" })).toEqual([
        "Amazon Web Services",
        "Slack",
        "Notion",
      ]);
    });

    it("treats a zero bound as a real bound", async () => {
      expect((await list({ minCents: "0" })).total).toBe(15);
      expect((await list({ maxCents: "0" })).total).toBe(0);
    });

    it("combines filters with AND", async () => {
      expect(
        await found({
          q: "amazon",
          category: "cloud",
          status: "posted,pending",
          direction: "out",
          from: "2026-06-01",
          accountId: ledger.checking.id,
          cardId: ledger.cloudCard.id,
          minCents: "1",
          maxCents: "12000",
        }),
      ).toEqual(["Amazon Web Services"]);
    });

    it("totals only the rows that match", async () => {
      expect((await list({ category: "cloud" })).summary).toEqual({
        inflowCents: 0,
        outflowCents: 37_000,
        netCents: -37_000,
      });
    });

    it("counts a failed payment as a match but not as money moved", async () => {
      const result = await list({ status: "failed" });

      expect(result.total).toBe(1);
      expect(result.summary).toEqual({
        inflowCents: 0,
        outflowCents: 0,
        netCents: 0,
      });
    });
  });

  describe("sorting", () => {
    it("sorts by date in either direction", async () => {
      const newestFirst = (await list({ sort: "date", order: "desc" })).items;
      const oldestFirst = (await list({ sort: "date", order: "asc" })).items;

      expect(oldestFirst[0].description).toBe("Northgate Health");
      expect(oldestFirst.map((item) => item.id)).toEqual(
        newestFirst.map((item) => item.id).reverse(),
      );
    });

    it("sorts by signed amount", async () => {
      const ascending = (await list({ sort: "amount", order: "asc" })).items;
      const descending = (await list({ sort: "amount", order: "desc" })).items;

      expect(ascending.slice(0, 3).map((item) => item.amountCents)).toEqual([
        -100_000, -90_000, -70_000,
      ]);
      expect(descending.slice(0, 3).map((item) => item.amountCents)).toEqual([
        200_000, 100_000, 50_000,
      ]);
    });

    it("sorts by description", async () => {
      const names = await found({ sort: "description", order: "asc" });

      expect(names.slice(0, 4)).toEqual([
        "Amazon Web Services",
        "Amazon Web Services",
        "Figma",
        "Google Ads",
      ]);
      expect(names.at(-1)).toBe("WeWork");
    });

    it("breaks ties on id so that equal keys always come back in the same order", async () => {
      const ascending = (await list({ sort: "amount", order: "asc" })).items;
      const tied = ascending.filter((item) => item.amountCents === -8_000);

      expect(tied.map((item) => item.id)).toEqual(
        [ledger.tx.slack.id, ledger.tx.notion.id].sort(),
      );
    });
  });

  describe("pagination", () => {
    it("splits the result into pages that neither overlap nor skip rows", async () => {
      const first = await list({ pageSize: "10" });
      const second = await list({ pageSize: "10", page: "2" });
      const everything = await list();

      expect(first).toMatchObject({ page: 1, pageCount: 2, total: 15 });
      expect(second).toMatchObject({ page: 2, pageCount: 2, total: 15 });
      expect(first.items).toHaveLength(10);
      expect(second.items).toHaveLength(5);
      expect([...first.items, ...second.items]).toEqual(everything.items);
    });

    it("reports the same totals on every page", async () => {
      const first = await list({ pageSize: "10" });
      const second = await list({ pageSize: "10", page: "2" });

      expect(second.summary).toEqual(first.summary);
      expect(first.summary.netCents).toBe(58_000);
    });

    it("falls back to the last page when asked for one past the end", async () => {
      const last = await list({ pageSize: "10", page: "2" });
      const beyond = await list({ pageSize: "10", page: "99" });

      expect(beyond.page).toBe(2);
      expect(beyond.items).toEqual(last.items);
    });

    it("returns one empty page when nothing matches", async () => {
      expect(await list({ q: "no such merchant" })).toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        pageCount: 1,
        summary: { inflowCents: 0, outflowCents: 0, netCents: 0 },
      });
    });
  });

  describe("workspace isolation", () => {
    it("never returns another workspace's rows", async () => {
      const mine = await list({ pageSize: "100" });
      const theirs = await listTransactions(
        db,
        OTHER_WORKSPACE_ID,
        filters({}),
      );

      expect(descriptions(mine.items)).not.toContain("Neighbour Cloud");
      expect(descriptions(theirs.items)).toEqual(["Neighbour Cloud"]);
      expect(theirs.summary.outflowCents).toBe(777_700);
    });

    it("finds nothing when filtering by another workspace's account or card", async () => {
      expect((await list({ accountId: neighbour.account.id })).total).toBe(0);
      expect((await list({ cardId: neighbour.card.id })).total).toBe(0);
      expect((await list({ q: "Neighbour" })).total).toBe(0);
    });
  });
});

describe("exportTransactions", () => {
  it("returns every match regardless of page and page size", async () => {
    const rows = await exportTransactions(
      db,
      WORKSPACE_ID,
      filters({ pageSize: "10", page: "2" }),
    );

    expect(rows).toHaveLength(15);
    expect(rows).toEqual((await list()).items);
  });

  it("applies the same filters and sort order as the list", async () => {
    const query = { direction: "out", sort: "amount", order: "asc" } as const;
    const rows = await exportTransactions(db, WORKSPACE_ID, filters(query));

    expect(rows).toEqual((await list(query)).items);
    expect(rows).toHaveLength(11);
    expect(rows[0].amountCents).toBe(-100_000);
  });

  it("stays inside the workspace", async () => {
    const rows = await exportTransactions(db, OTHER_WORKSPACE_ID, filters());

    expect(descriptions(rows)).toEqual(["Neighbour Cloud"]);
  });

  it("stops at 5,000 rows however many match", async () => {
    const workspaceId = randomUUID();
    await addWorkspace(db, workspaceId);
    const account = await addAccount(db, workspaceId);
    await db.execute(sql`
      insert into transactions
        (workspace_id, account_id, posted_at, description, amount_cents,
         category, method, status, reference)
      select ${workspaceId}::uuid, ${account.id}::uuid,
             timestamptz '2026-01-01' + n * interval '1 minute', 'Bulk row', -100,
             'other', 'ach', 'posted', 'ALD-BULK'
      from generate_series(1, ${EXPORT_LIMIT + 25}) as n
    `);

    const rows = await exportTransactions(db, workspaceId, filters());
    const listed = await listTransactions(db, workspaceId, filters());

    expect(EXPORT_LIMIT).toBe(5_000);
    expect(listed.total).toBe(5_025);
    expect(rows).toHaveLength(5_000);
    // Newest first, so the cap drops the oldest rows.
    expect(rows[0].id).toBe(listed.items[0].id);
  });
});

describe("getTransaction", () => {
  it("returns one transaction with its display names", async () => {
    expect(await getTransaction(db, WORKSPACE_ID, ledger.tx.failed.id)).toEqual(
      {
        id: ledger.tx.failed.id,
        accountId: ledger.checking.id,
        accountName: "Checking",
        postedAt: "2026-06-15T09:00:00.000Z",
        description: "Hartwell Staffing",
        amountCents: -30_000,
        category: "services",
        method: "ach",
        status: "failed",
        reference: ledger.tx.failed.reference,
        note: "Returned by receiving bank",
        cardId: null,
        cardLabel: null,
        cardLast4: null,
        recipientId: ledger.recipient.id,
        counterpartyAccountName: null,
      },
    );
  });

  it("reports an unknown id as not found", async () => {
    await expect(
      getTransaction(db, WORKSPACE_ID, UNKNOWN_ID),
    ).rejects.toMatchObject(notFound);
  });

  it("reports another workspace's transaction as not found", async () => {
    await expect(
      getTransaction(db, WORKSPACE_ID, neighbour.transaction.id),
    ).rejects.toMatchObject(notFound);
    await expect(
      getTransaction(db, OTHER_WORKSPACE_ID, ledger.tx.slack.id),
    ).rejects.toMatchObject(notFound);
  });
});

describe("findByIdempotencyKey", () => {
  it("returns the transaction created with the key", async () => {
    const row = await findByIdempotencyKey(
      db,
      OTHER_WORKSPACE_ID,
      "neighbour-key",
    );

    expect(row).toMatchObject({
      id: neighbour.transaction.id,
      description: "Neighbour Cloud",
      amountCents: -777_700,
    });
  });

  it("returns null for a key that was never used", async () => {
    expect(
      await findByIdempotencyKey(db, WORKSPACE_ID, "never-used"),
    ).toBeNull();
  });

  it("does not find a key that belongs to another workspace", async () => {
    expect(
      await findByIdempotencyKey(db, WORKSPACE_ID, "neighbour-key"),
    ).toBeNull();
  });
});

describe("listRecent", () => {
  it("returns the latest activity, newest first, without scheduled payments", async () => {
    expect(descriptions(await listRecent(db, WORKSPACE_ID, 3))).toEqual([
      "Stripe",
      "Amazon Web Services",
      "Slack",
    ]);
  });

  it("includes failed payments, which the user needs to see", async () => {
    const recent = await listRecent(db, WORKSPACE_ID, 100);

    expect(recent).toHaveLength(14);
    expect(descriptions(recent)).toContain("Hartwell Staffing");
    expect(descriptions(recent)).not.toContain("Gusto Payroll");
  });

  it("stays inside the workspace", async () => {
    expect(descriptions(await listRecent(db, OTHER_WORKSPACE_ID, 10))).toEqual([
      "Neighbour Cloud",
    ]);
  });
});

describe("listUpcoming", () => {
  it("returns only scheduled payments", async () => {
    const upcoming = await listUpcoming(db, WORKSPACE_ID, 5);

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      description: "Gusto Payroll",
      status: "scheduled",
      amountCents: -90_000,
      postedAt: "2026-06-25T15:00:00.000Z",
    });
  });

  it("is empty for a workspace with nothing scheduled", async () => {
    expect(await listUpcoming(db, OTHER_WORKSPACE_ID, 5)).toEqual([]);
  });
});

describe("findLargestExpense", () => {
  const thirtyDaysAgo = addDays(NOW, -30);

  it("finds the biggest settled or pending payment, ignoring transfers and failed payments", async () => {
    // The -100,000 transfer and the failed -30,000 are both larger, and both ignored.
    const largest = await findLargestExpense(
      db,
      WORKSPACE_ID,
      thirtyDaysAgo,
      NOW,
    );

    expect(largest).toMatchObject({
      id: ledger.tx.awsMay.id,
      description: "Amazon Web Services",
      amountCents: -20_000,
    });
  });

  it("ignores scheduled payments even when they fall inside the window", async () => {
    const largest = await findLargestExpense(
      db,
      WORKSPACE_ID,
      utc("2026-01-01T00:00:00"),
      utc("2026-07-01T00:00:00"),
    );

    expect(largest).toMatchObject({
      description: "WeWork",
      amountCents: -70_000,
    });
  });

  it("counts pending payments", async () => {
    const largest = await findLargestExpense(
      db,
      WORKSPACE_ID,
      utc("2026-06-17T00:00:00"),
      NOW,
    );

    expect(largest).toMatchObject({
      id: ledger.tx.awsToday.id,
      status: "pending",
    });
  });

  it("includes payments dated exactly at either end of the window", async () => {
    const at = ledger.tx.slack.postedAt;

    expect(await findLargestExpense(db, WORKSPACE_ID, at, at)).toMatchObject({
      id: ledger.tx.slack.id,
    });
  });

  it("picks the same row every time when two payments tie", async () => {
    const tied = await findLargestExpense(
      db,
      WORKSPACE_ID,
      ledger.tx.notion.postedAt,
      ledger.tx.slack.postedAt,
    );

    expect(tied?.amountCents).toBe(-8_000);
    expect(tied?.id).toBe([ledger.tx.slack.id, ledger.tx.notion.id].sort()[0]);
  });

  it("is null when nothing was spent in the window", async () => {
    expect(
      await findLargestExpense(
        db,
        WORKSPACE_ID,
        utc("2026-04-01T00:00:00"),
        utc("2026-04-30T00:00:00"),
      ),
    ).toBeNull();
  });

  it("stays inside the workspace", async () => {
    expect(
      await findLargestExpense(db, OTHER_WORKSPACE_ID, thirtyDaysAgo, NOW),
    ).toMatchObject({ description: "Neighbour Cloud" });
  });
});

describe("with a changing ledger", () => {
  beforeEach(async () => {
    await db.delete(workspaces);
    ledger = await seedLedger(db, WORKSPACE_ID);
    neighbour = await seedNeighbour(db, OTHER_WORKSPACE_ID);
  });

  const stored = async (id: string) =>
    (await db.select().from(transactions).where(eq(transactions.id, id)))[0];

  describe("updateTransaction", () => {
    it("adds a note and returns the updated transaction", async () => {
      const updated = await updateTransaction(
        db,
        WORKSPACE_ID,
        ledger.tx.slack.id,
        { note: "Annual plan, renews in June" },
      );

      expect(updated).toMatchObject({
        id: ledger.tx.slack.id,
        note: "Annual plan, renews in June",
        category: "software",
        amountCents: -8_000,
      });
      expect((await stored(ledger.tx.slack.id)).note).toBe(
        "Annual plan, renews in June",
      );
    });

    it.each([[""], [null]])("clears the note when given %j", async (note) => {
      const updated = await updateTransaction(
        db,
        WORKSPACE_ID,
        ledger.tx.failed.id,
        { note },
      );

      expect(updated.note).toBeNull();
      expect((await stored(ledger.tx.failed.id)).note).toBeNull();
    });

    it("recategorises a transaction without touching its note", async () => {
      const updated = await updateTransaction(
        db,
        WORKSPACE_ID,
        ledger.tx.failed.id,
        { category: "payroll" },
      );

      expect(updated).toMatchObject({
        category: "payroll",
        note: "Returned by receiving bank",
      });
    });

    it("can change the note and the category together", async () => {
      const updated = await updateTransaction(
        db,
        WORKSPACE_ID,
        ledger.tx.vercel.id,
        { note: "Hosting", category: "software" },
      );

      expect(updated).toMatchObject({ note: "Hosting", category: "software" });
    });

    it("changes nothing else about the transaction, and no other transaction", async () => {
      const before = await ledgerRows(db, WORKSPACE_ID);

      await updateTransaction(db, WORKSPACE_ID, ledger.tx.slack.id, {
        note: "Checked",
        category: "cloud",
      });

      const after = await ledgerRows(db, WORKSPACE_ID);
      expect(after).toEqual(
        before.map((row) =>
          row.id === ledger.tx.slack.id
            ? { ...row, note: "Checked", category: "cloud" }
            : row,
        ),
      );
    });

    it("refuses to recategorise an internal transfer", async () => {
      await expect(
        updateTransaction(db, WORKSPACE_ID, ledger.tx.transferOut.id, {
          category: "software",
        }),
      ).rejects.toMatchObject({
        code: "validation_error",
        status: 422,
        message: "This transaction's category is set by the bank.",
        fields: { category: "Category cannot be changed" },
      });
      expect((await stored(ledger.tx.transferOut.id)).category).toBe(
        "transfer",
      );
    });

    it("refuses to recategorise interest, and applies none of the request", async () => {
      const interest = await addTransaction(db, ledger.savings, {
        postedAt: utc("2026-05-31T12:00:00"),
        amountCents: 162_50,
        description: "Interest earned",
        category: "interest",
        method: "interest",
      });

      await expect(
        updateTransaction(db, WORKSPACE_ID, interest.id, {
          category: "revenue",
          note: "Should not be saved",
        }),
      ).rejects.toMatchObject({ code: "validation_error", status: 422 });
      expect(await stored(interest.id)).toMatchObject({
        category: "interest",
        note: null,
      });
    });

    it("still lets a transfer carry a note", async () => {
      const updated = await updateTransaction(
        db,
        WORKSPACE_ID,
        ledger.tx.transferOut.id,
        { note: "Quarterly reserve top-up" },
      );

      expect(updated).toMatchObject({
        category: "transfer",
        note: "Quarterly reserve top-up",
      });
    });

    it("finds a note containing wildcard characters only by its literal text", async () => {
      await updateTransaction(db, WORKSPACE_ID, ledger.tx.googleAds.id, {
        note: "100% of Q2_budget",
      });

      expect(await found({ q: "100%" })).toEqual(["Google Ads"]);
      expect(await found({ q: "q2_b" })).toEqual(["Google Ads"]);
      expect(await found({ q: "100_" })).toEqual([]);
      expect(await found({ q: "Q2%budget" })).toEqual([]);
    });

    it("reports an unknown id as not found", async () => {
      await expect(
        updateTransaction(db, WORKSPACE_ID, UNKNOWN_ID, { note: "Hello" }),
      ).rejects.toMatchObject(notFound);
    });

    it("cannot change another workspace's transaction", async () => {
      await expect(
        updateTransaction(db, WORKSPACE_ID, neighbour.transaction.id, {
          note: "Tampered",
          category: "other",
        }),
      ).rejects.toMatchObject(notFound);
      expect(await stored(neighbour.transaction.id)).toMatchObject({
        note: null,
        category: "cloud",
      });
    });
  });

  describe("listUpcoming", () => {
    it("orders scheduled payments soonest first and respects the limit", async () => {
      await addTransaction(db, ledger.checking, {
        postedAt: utc("2026-06-20T15:00:00"),
        amountCents: -1_000,
        description: "Sooner",
        status: "scheduled",
      });
      await addTransaction(db, ledger.checking, {
        postedAt: utc("2026-07-02T15:00:00"),
        amountCents: -1_000,
        description: "Later",
        status: "scheduled",
      });

      expect(descriptions(await listUpcoming(db, WORKSPACE_ID, 5))).toEqual([
        "Sooner",
        "Gusto Payroll",
        "Later",
      ]);
      expect(descriptions(await listUpcoming(db, WORKSPACE_ID, 2))).toEqual([
        "Sooner",
        "Gusto Payroll",
      ]);
    });
  });
});
