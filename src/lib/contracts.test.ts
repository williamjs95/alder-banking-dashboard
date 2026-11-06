import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { ids } from "../../test/fixtures";
import {
  ASSIGNABLE_CATEGORIES,
  createCardSchema,
  createPaymentSchema,
  createRecipientSchema,
  createTransferSchema,
  MAX_AMOUNT_CENTS,
  PAGE_SIZES,
  SORT_FIELDS,
  transactionFiltersSchema,
  updateCardSchema,
  updateTransactionSchema,
} from "./contracts";

/** The issues a schema raises for `input`, as "path: message" (empty when it passes). */
function issues(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}

/** The top-level fields a schema rejects for `input`. */
function rejectedFields(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => String(issue.path[0] ?? ""));
}

describe("ASSIGNABLE_CATEGORIES", () => {
  it("leaves out the two categories the system assigns itself", () => {
    expect(ASSIGNABLE_CATEGORIES).not.toContain("transfer");
    expect(ASSIGNABLE_CATEGORIES).not.toContain("interest");
    expect(ASSIGNABLE_CATEGORIES).toEqual([
      "revenue",
      "payroll",
      "taxes",
      "rent",
      "cloud",
      "software",
      "marketing",
      "travel",
      "services",
      "insurance",
      "other",
    ]);
  });
});

describe("transactionFiltersSchema", () => {
  const parse = (input: unknown) => transactionFiltersSchema.parse(input);

  it("fills in sort, order and paging defaults for an empty query", () => {
    expect(parse({})).toEqual({
      sort: "date",
      order: "desc",
      page: 1,
      pageSize: 25,
    });
  });

  it("accepts a full set of filters, coercing the numeric strings a URL carries", () => {
    expect(
      parse({
        q: "stripe",
        accountId: ids.checking,
        cardId: ids.cardCloud,
        category: "payroll,taxes",
        status: "posted,pending",
        direction: "out",
        from: "2026-06-01",
        to: "2026-06-30",
        minCents: "1000",
        maxCents: "500000",
        sort: "amount",
        order: "asc",
        page: "3",
        pageSize: "50",
      }),
    ).toEqual({
      q: "stripe",
      accountId: ids.checking,
      cardId: ids.cardCloud,
      category: ["payroll", "taxes"],
      status: ["posted", "pending"],
      direction: "out",
      from: "2026-06-01",
      to: "2026-06-30",
      minCents: 1000,
      maxCents: 500000,
      sort: "amount",
      order: "asc",
      page: 3,
      pageSize: 50,
    });
  });

  describe("comma-separated lists", () => {
    it("splits a single value into a one-item list", () => {
      expect(parse({ category: "cloud" }).category).toEqual(["cloud"]);
    });

    it("ignores empty segments from stray commas", () => {
      expect(parse({ category: ",payroll,,taxes," }).category).toEqual([
        "payroll",
        "taxes",
      ]);
      expect(parse({ status: "failed," }).status).toEqual(["failed"]);
    });

    it("reads an empty string as an empty list", () => {
      expect(parse({ category: "" }).category).toEqual([]);
    });

    it("rejects the whole list when any value is unknown", () => {
      expect(
        rejectedFields(transactionFiltersSchema, {
          category: "payroll,groceries",
        }),
      ).toEqual(["category"]);
      expect(
        rejectedFields(transactionFiltersSchema, { status: "posted,settled" }),
      ).toEqual(["status"]);
    });

    it("is case sensitive", () => {
      expect(
        rejectedFields(transactionFiltersSchema, { category: "Payroll" }),
      ).toEqual(["category"]);
    });
  });

  describe("search text", () => {
    it("trims surrounding whitespace", () => {
      expect(parse({ q: "  aws  " }).q).toBe("aws");
    });

    it("accepts up to 100 characters and rejects more", () => {
      expect(parse({ q: "a".repeat(100) }).q).toHaveLength(100);
      expect(
        rejectedFields(transactionFiltersSchema, { q: "a".repeat(101) }),
      ).toEqual(["q"]);
    });
  });

  it("rejects ids that are not UUIDs", () => {
    expect(
      rejectedFields(transactionFiltersSchema, {
        accountId: "checking",
        cardId: "42",
      }),
    ).toEqual(["accountId", "cardId"]);
  });

  it("accepts only in or out as a direction", () => {
    expect(parse({ direction: "in" }).direction).toBe("in");
    expect(
      rejectedFields(transactionFiltersSchema, { direction: "both" }),
    ).toEqual(["direction"]);
  });

  it.each(["06/01/2026", "2026-6-1", "2026-13-01", "2026-06-01T00:00:00Z"])(
    "rejects %j as a date",
    (value) => {
      expect(rejectedFields(transactionFiltersSchema, { from: value })).toEqual(
        ["from"],
      );
      expect(rejectedFields(transactionFiltersSchema, { to: value })).toEqual([
        "to",
      ]);
    },
  );

  describe("amount bounds", () => {
    it("accepts zero and whole cents", () => {
      expect(parse({ minCents: "0", maxCents: 250 })).toMatchObject({
        minCents: 0,
        maxCents: 250,
      });
    });

    it.each(["-1", "10.5", "abc"])("rejects %j", (value) => {
      expect(
        rejectedFields(transactionFiltersSchema, { minCents: value }),
      ).toEqual(["minCents"]);
      expect(
        rejectedFields(transactionFiltersSchema, { maxCents: value }),
      ).toEqual(["maxCents"]);
    });
  });

  describe("sorting", () => {
    it.each(SORT_FIELDS)("accepts sorting by %s", (sort) => {
      expect(parse({ sort }).sort).toBe(sort);
    });

    it("rejects unknown sort fields and orders", () => {
      expect(
        rejectedFields(transactionFiltersSchema, {
          sort: "category",
          order: "up",
        }),
      ).toEqual(["sort", "order"]);
    });
  });

  describe("paging", () => {
    it("starts pages at 1", () => {
      expect(parse({ page: "1" }).page).toBe(1);
      expect(rejectedFields(transactionFiltersSchema, { page: "0" })).toEqual([
        "page",
      ]);
      expect(rejectedFields(transactionFiltersSchema, { page: "-2" })).toEqual([
        "page",
      ]);
      expect(rejectedFields(transactionFiltersSchema, { page: "1.5" })).toEqual(
        ["page"],
      );
    });

    it.each(PAGE_SIZES)("accepts a page size of %d", (size) => {
      expect(parse({ pageSize: String(size) }).pageSize).toBe(size);
    });

    it.each(["0", "1", "20", "101", "1000", "25.5", "all"])(
      "rejects a page size of %j",
      (value) => {
        expect(
          rejectedFields(transactionFiltersSchema, { pageSize: value }),
        ).toContain("pageSize");
      },
    );

    it("explains why a page size off the whitelist is refused", () => {
      expect(issues(transactionFiltersSchema, { pageSize: "20" })).toEqual([
        "pageSize: Unsupported page size",
      ]);
    });
  });
});

describe("updateTransactionSchema", () => {
  it("accepts a note, a category, or both", () => {
    expect(updateTransactionSchema.parse({ note: "Q2 audit" })).toEqual({
      note: "Q2 audit",
    });
    expect(updateTransactionSchema.parse({ category: "software" })).toEqual({
      category: "software",
    });
    expect(
      updateTransactionSchema.parse({ note: "Q2 audit", category: "services" }),
    ).toEqual({ note: "Q2 audit", category: "services" });
  });

  it("accepts null to clear the note", () => {
    expect(updateTransactionSchema.parse({ note: null })).toEqual({
      note: null,
    });
  });

  it("refuses an update that changes nothing", () => {
    expect(issues(updateTransactionSchema, {})).toEqual([
      ": Nothing to update",
    ]);
    expect(
      issues(updateTransactionSchema, { note: undefined, category: undefined }),
    ).toEqual([": Nothing to update"]);
  });

  it("trims the note and limits it to 280 characters", () => {
    expect(updateTransactionSchema.parse({ note: "  hello  " }).note).toBe(
      "hello",
    );
    expect(
      updateTransactionSchema.parse({ note: "n".repeat(280) }).note,
    ).toHaveLength(280);
    expect(
      rejectedFields(updateTransactionSchema, { note: "n".repeat(281) }),
    ).toEqual(["note"]);
  });

  it.each(["transfer", "interest", "groceries"])(
    "does not let a person assign the %s category",
    (category) => {
      expect(rejectedFields(updateTransactionSchema, { category })).toEqual([
        "category",
      ]);
    },
  );
});

describe("createPaymentSchema", () => {
  const valid = {
    fromAccountId: ids.checking,
    recipientId: ids.recipientPilot,
    amountCents: 4_200_00,
    method: "ach",
  };

  it("accepts a payment to send now", () => {
    expect(createPaymentSchema.parse(valid)).toEqual(valid);
  });

  it("accepts a memo and a scheduled date", () => {
    expect(
      createPaymentSchema.parse({
        ...valid,
        method: "wire",
        memo: "  Invoice 1042  ",
        scheduledFor: "2026-07-01",
      }),
    ).toEqual({
      ...valid,
      method: "wire",
      memo: "Invoice 1042",
      scheduledFor: "2026-07-01",
    });
  });

  it.each([
    [0, "Enter an amount greater than zero"],
    [-500, "Enter an amount greater than zero"],
    [10.5, "Enter an amount in whole cents"],
    [MAX_AMOUNT_CENTS + 1, "Amount is above the per-payment limit"],
    ["4200", "Enter an amount"],
    [null, "Enter an amount"],
    [undefined, "Enter an amount"],
    [Number.NaN, "Enter an amount"],
  ])("rejects an amount of %j: %s", (amountCents, message) => {
    expect(issues(createPaymentSchema, { ...valid, amountCents })).toEqual([
      `amountCents: ${message}`,
    ]);
  });

  it("accepts one cent and exactly the per-payment limit", () => {
    expect(
      createPaymentSchema.parse({ ...valid, amountCents: 1 }).amountCents,
    ).toBe(1);
    expect(
      createPaymentSchema.parse({ ...valid, amountCents: MAX_AMOUNT_CENTS })
        .amountCents,
    ).toBe(10_000_000_00);
  });

  it("asks for an account and a recipient when they are missing or malformed", () => {
    expect(
      issues(createPaymentSchema, {
        ...valid,
        fromAccountId: "",
        recipientId: "not-a-uuid",
      }),
    ).toEqual([
      "fromAccountId: Choose an account",
      "recipientId: Choose a recipient",
    ]);
  });

  it.each(["card", "transfer", "interest", "check"])(
    "does not allow paying by %s",
    (method) => {
      expect(rejectedFields(createPaymentSchema, { ...valid, method })).toEqual(
        ["method"],
      );
    },
  );

  it("limits the memo to 140 characters", () => {
    expect(
      createPaymentSchema.parse({ ...valid, memo: "m".repeat(140) }).memo,
    ).toHaveLength(140);
    expect(
      issues(createPaymentSchema, { ...valid, memo: "m".repeat(141) }),
    ).toEqual(["memo: Keep the memo under 140 characters"]);
  });

  it("requires the scheduled date as YYYY-MM-DD", () => {
    expect(
      rejectedFields(createPaymentSchema, {
        ...valid,
        scheduledFor: "July 1, 2026",
      }),
    ).toEqual(["scheduledFor"]);
  });
});

describe("createTransferSchema", () => {
  const valid = {
    fromAccountId: ids.treasury,
    toAccountId: ids.checking,
    amountCents: 60_000_00,
  };

  it("accepts a transfer between two accounts, with an optional memo", () => {
    expect(createTransferSchema.parse(valid)).toEqual(valid);
    expect(
      createTransferSchema.parse({ ...valid, memo: " Payroll top-up " }).memo,
    ).toBe("Payroll top-up");
  });

  it("refuses a transfer to the same account, flagging the destination", () => {
    expect(
      issues(createTransferSchema, { ...valid, toAccountId: ids.treasury }),
    ).toEqual(["toAccountId: Choose two different accounts"]);
  });

  it("asks for both accounts", () => {
    expect(
      issues(createTransferSchema, {
        amountCents: 100,
        fromAccountId: "",
        toAccountId: "x",
      }),
    ).toEqual([
      "fromAccountId: Choose an account",
      "toAccountId: Choose an account",
    ]);
  });

  it("applies the same amount and memo limits as a payment", () => {
    expect(issues(createTransferSchema, { ...valid, amountCents: 0 })).toEqual([
      "amountCents: Enter an amount greater than zero",
    ]);
    expect(
      issues(createTransferSchema, {
        ...valid,
        amountCents: MAX_AMOUNT_CENTS + 1,
      }),
    ).toEqual(["amountCents: Amount is above the per-payment limit"]);
    expect(
      issues(createTransferSchema, { ...valid, memo: "m".repeat(141) }),
    ).toEqual(["memo: Keep the memo under 140 characters"]);
  });
});

describe("createRecipientSchema", () => {
  const valid = {
    name: "Pilot.com, Inc.",
    email: "billing@pilot.example",
    bankName: "Silicon Valley Bank",
    routingNumber: "121140399",
    accountNumber: "0012344406",
    defaultMethod: "wire",
  };

  it("accepts a complete recipient", () => {
    expect(createRecipientSchema.parse(valid)).toEqual(valid);
  });

  it("defaults the payment method to ACH", () => {
    expect(
      createRecipientSchema.parse({ ...valid, defaultMethod: undefined })
        .defaultMethod,
    ).toBe("ach");
  });

  it("trims the text fields", () => {
    expect(
      createRecipientSchema.parse({
        ...valid,
        name: "  Pilot  ",
        bankName: "  SVB  ",
        routingNumber: " 121140399 ",
        accountNumber: " 0012344406 ",
      }),
    ).toMatchObject({
      name: "Pilot",
      bankName: "SVB",
      routingNumber: "121140399",
      accountNumber: "0012344406",
    });
  });

  describe("email", () => {
    it("is optional", () => {
      expect(
        createRecipientSchema.parse({ ...valid, email: undefined }).email,
      ).toBeUndefined();
    });

    it("treats the empty string an untouched form field sends as no email", () => {
      expect(
        createRecipientSchema.parse({ ...valid, email: "" }).email,
      ).toBeUndefined();
    });

    it.each(["pilot", "billing@", "@pilot.example", "a b@pilot.example", " "])(
      "rejects %j",
      (email) => {
        expect(issues(createRecipientSchema, { ...valid, email })).toEqual([
          "email: Enter a valid email",
        ]);
      },
    );
  });

  describe("routing number", () => {
    it.each(["12114039", "1211403990", "12114039a", "121-140-399", ""])(
      "rejects %j",
      (routingNumber) => {
        expect(
          issues(createRecipientSchema, { ...valid, routingNumber }),
        ).toEqual(["routingNumber: Routing numbers have 9 digits"]);
      },
    );
  });

  describe("account number", () => {
    it.each(["123456", "12345678901234567"])(
      "accepts %j (6 to 17 digits)",
      (accountNumber) => {
        expect(
          createRecipientSchema.parse({ ...valid, accountNumber })
            .accountNumber,
        ).toBe(accountNumber);
      },
    );

    it.each(["12345", "123456789012345678", "12345a", "1234 5678", ""])(
      "rejects %j",
      (accountNumber) => {
        expect(
          issues(createRecipientSchema, { ...valid, accountNumber }),
        ).toEqual(["accountNumber: Account numbers have 6 to 17 digits"]);
      },
    );
  });

  it("asks for a name and a bank name of at least two characters after trimming", () => {
    expect(
      issues(createRecipientSchema, { ...valid, name: " P ", bankName: "" }),
    ).toEqual([
      "name: Enter the recipient's name",
      "bankName: Enter the bank name",
    ]);
  });

  it("limits the name and bank name to 80 characters", () => {
    expect(
      createRecipientSchema.parse({ ...valid, name: "n".repeat(80) }).name,
    ).toHaveLength(80);
    expect(
      rejectedFields(createRecipientSchema, {
        ...valid,
        name: "n".repeat(81),
        bankName: "b".repeat(81),
      }),
    ).toEqual(["name", "bankName"]);
  });

  it("allows only ACH or wire as the default method", () => {
    expect(
      rejectedFields(createRecipientSchema, {
        ...valid,
        defaultMethod: "card",
      }),
    ).toEqual(["defaultMethod"]);
  });
});

describe("createCardSchema", () => {
  const valid = {
    label: "Cloud infrastructure",
    holderName: "Maya Chen",
    accountId: ids.checking,
    monthlyLimitCents: 25_000_00,
  };

  it("accepts a card, trimming its label and holder", () => {
    expect(
      createCardSchema.parse({
        ...valid,
        label: "  Cloud infrastructure ",
        holderName: " Maya Chen  ",
      }),
    ).toEqual(valid);
  });

  it("accepts limits from $100 to $250,000 inclusive", () => {
    expect(
      createCardSchema.parse({ ...valid, monthlyLimitCents: 100_00 })
        .monthlyLimitCents,
    ).toBe(100_00);
    expect(
      createCardSchema.parse({ ...valid, monthlyLimitCents: 250_000_00 })
        .monthlyLimitCents,
    ).toBe(250_000_00);
  });

  it("refuses a NUL character in free text, which the database cannot store", () => {
    expect(
      issues(createCardSchema, { ...valid, label: "Travel\u0000" }),
    ).toEqual(["label: Remove the unsupported character"]);
    expect(issues(transactionFiltersSchema, { q: "strip\u0000e" })).toEqual([
      "q: Remove the unsupported character",
    ]);
    expect(
      issues(updateTransactionSchema, { note: "see\u0000 attached" }),
    ).toEqual(["note: Remove the unsupported character"]);
  });

  it("asks for a limit in plain words when none is given", () => {
    expect(
      issues(createCardSchema, { ...valid, monthlyLimitCents: undefined }),
    ).toEqual(["monthlyLimitCents: Enter a limit"]);
  });

  it("rejects limits outside that range", () => {
    expect(
      issues(createCardSchema, { ...valid, monthlyLimitCents: 99_99 }),
    ).toEqual(["monthlyLimitCents: The minimum limit is $100"]);
    expect(
      issues(createCardSchema, { ...valid, monthlyLimitCents: 250_000_01 }),
    ).toEqual(["monthlyLimitCents: The maximum limit is $250,000"]);
  });

  it("rejects fractional cents and non-numbers", () => {
    expect(
      rejectedFields(createCardSchema, { ...valid, monthlyLimitCents: 500.5 }),
    ).toEqual(["monthlyLimitCents"]);
    expect(
      rejectedFields(createCardSchema, { ...valid, monthlyLimitCents: "5000" }),
    ).toEqual(["monthlyLimitCents"]);
  });

  it("asks for a card name, a cardholder and an account", () => {
    expect(
      issues(createCardSchema, {
        ...valid,
        label: "A",
        holderName: " ",
        accountId: "",
      }),
    ).toEqual([
      "label: Give the card a name",
      "holderName: Enter the cardholder's name",
      "accountId: Choose an account",
    ]);
  });

  it("limits the label to 40 characters and the holder to 60", () => {
    expect(
      createCardSchema.parse({
        ...valid,
        label: "l".repeat(40),
        holderName: "h".repeat(60),
      }),
    ).toMatchObject({ label: "l".repeat(40), holderName: "h".repeat(60) });
    expect(
      rejectedFields(createCardSchema, {
        ...valid,
        label: "l".repeat(41),
        holderName: "h".repeat(61),
      }),
    ).toEqual(["label", "holderName"]);
  });
});

describe("updateCardSchema", () => {
  it("accepts a status change, a new limit, or both", () => {
    expect(updateCardSchema.parse({ status: "frozen" })).toEqual({
      status: "frozen",
    });
    expect(updateCardSchema.parse({ monthlyLimitCents: 8_000_00 })).toEqual({
      monthlyLimitCents: 8_000_00,
    });
    expect(
      updateCardSchema.parse({ status: "active", monthlyLimitCents: 100_00 }),
    ).toEqual({ status: "active", monthlyLimitCents: 100_00 });
  });

  it("refuses an update that changes nothing", () => {
    expect(issues(updateCardSchema, {})).toEqual([": Nothing to update"]);
  });

  it("rejects unknown statuses", () => {
    expect(rejectedFields(updateCardSchema, { status: "cancelled" })).toEqual([
      "status",
    ]);
  });

  it("holds a changed limit to the same range as a new card", () => {
    expect(issues(updateCardSchema, { monthlyLimitCents: 99_99 })).toEqual([
      "monthlyLimitCents: The minimum limit is $100",
    ]);
    expect(issues(updateCardSchema, { monthlyLimitCents: 250_000_01 })).toEqual(
      ["monthlyLimitCents: The maximum limit is $250,000"],
    );
  });
});
