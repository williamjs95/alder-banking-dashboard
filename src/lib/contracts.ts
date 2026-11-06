import { z } from "zod";
import {
  CARD_STATUSES,
  CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  type AccountType,
  type CardStatus,
  type CardType,
  type Category,
  type PaymentMethod,
  type TransactionMethod,
  type TransactionStatus,
} from "./domain";

/**
 * The API contract: request schemas (validated on the server, reused by forms
 * on the client) and response shapes. Dates cross the wire as ISO strings and
 * money as integer cents.
 */

// ---------------------------------------------------------------- responses

export type AccountDto = {
  id: string;
  name: string;
  type: AccountType;
  last4: string;
  balanceCents: number;
  apyBps: number;
};

export type AccountNumbersDto = {
  accountNumber: string;
  routingNumber: string;
};

export type TransactionDto = {
  id: string;
  accountId: string;
  accountName: string;
  postedAt: string;
  description: string;
  amountCents: number;
  category: Category;
  method: TransactionMethod;
  status: TransactionStatus;
  reference: string;
  note: string | null;
  cardId: string | null;
  cardLabel: string | null;
  cardLast4: string | null;
  recipientId: string | null;
  counterpartyAccountName: string | null;
};

export type TransactionListDto = {
  items: TransactionDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Totals across every match, not just the current page. */
  summary: { inflowCents: number; outflowCents: number; netCents: number };
};

export type BalancePoint = { date: string; balanceCents: number };
export type FlowTotals = { inflowCents: number; outflowCents: number };
export type CashflowMonth = FlowTotals & { month: string; netCents: number };
export type CategoryTotal = { category: Category; cents: number };

export type OverviewDto = {
  totalBalanceCents: number;
  accounts: AccountDto[];
  /** One point per day for the past year, oldest first. */
  balanceSeries: BalancePoint[];
  last30Days: FlowTotals;
  previous30Days: FlowTotals;
  cashflow: CashflowMonth[];
  spendByCategory: CategoryTotal[];
  /** Average monthly net outflow over the last three full months. Negative means net inflow. */
  monthlyBurnCents: number;
  /** Null when the company is not burning cash. */
  runwayMonths: number | null;
  recent: TransactionDto[];
  upcoming: TransactionDto[];
};

export type AccountDetailDto = {
  account: AccountDto;
  balanceSeries: BalancePoint[];
  last30Days: FlowTotals;
};

export type MerchantTotal = {
  description: string;
  cents: number;
  count: number;
};
export type CategoryComparison = {
  category: Category;
  currentCents: number;
  previousCents: number;
};
export type CategoryTrendMonth = {
  month: string;
  totals: Partial<Record<Category, number>>;
};

export type InsightsDto = {
  /** Spend per category for each of the last six months, oldest first. */
  categoryTrend: CategoryTrendMonth[];
  /** Categories in the trend, largest first. */
  trendCategories: Category[];
  topMerchants: MerchantTotal[];
  categoryComparison: CategoryComparison[];
  averageMonthlySpendCents: number;
  averageMonthlyRevenueCents: number;
  largestExpense: TransactionDto | null;
};

export type RecipientDto = {
  id: string;
  name: string;
  email: string | null;
  bankName: string;
  accountLast4: string;
  defaultMethod: PaymentMethod;
  createdAt: string;
};

export type CardDto = {
  id: string;
  accountId: string;
  accountName: string;
  label: string;
  holderName: string;
  last4: string;
  type: CardType;
  status: CardStatus;
  monthlyLimitCents: number;
  /** Settled and pending card spend in the current calendar month. */
  spentThisMonthCents: number;
  expMonth: number;
  expYear: number;
};

export type PaymentResultDto = {
  payment: TransactionDto;
  fee: TransactionDto | null;
};

export type TransferResultDto = {
  debit: TransactionDto;
  credit: TransactionDto;
};

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

// ----------------------------------------------------------------- requests

/** Categories a person may assign by hand. The other two are system-owned. */
export const ASSIGNABLE_CATEGORIES = CATEGORIES.filter(
  (category) => category !== "transfer" && category !== "interest",
) as Exclude<Category, "transfer" | "interest">[];

export const SORT_FIELDS = ["date", "amount", "description"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const MAX_AMOUNT_CENTS = 10_000_000_00;

/**
 * Free text from a person. Trimmed, and refused if it contains a NUL
 * character, which Postgres text columns cannot store.
 */
const text = () =>
  z
    .string()
    .trim()
    .refine((value) => !value.includes("\u0000"), {
      message: "Remove the unsupported character",
    });

const isoDate = z.iso.date();
const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.enum(values)));

export const transactionFiltersSchema = z.object({
  q: text().max(100).optional(),
  accountId: z.uuid().optional(),
  cardId: z.uuid().optional(),
  category: csv(CATEGORIES).optional(),
  status: csv(TRANSACTION_STATUSES).optional(),
  direction: z.enum(["in", "out"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** Bounds on the absolute amount, in cents. */
  minCents: z.coerce.number().int().min(0).optional(),
  maxCents: z.coerce.number().int().min(0).optional(),
  sort: z.enum(SORT_FIELDS).default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), {
      message: "Unsupported page size",
    })
    .default(25),
});
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
export type TransactionFiltersInput = z.input<typeof transactionFiltersSchema>;

export const updateTransactionSchema = z
  .object({
    note: text().max(280).nullable().optional(),
    category: z.enum(ASSIGNABLE_CATEGORIES).optional(),
  })
  .refine((value) => value.note !== undefined || value.category !== undefined, {
    message: "Nothing to update",
  });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

const amountCents = z
  .number("Enter an amount")
  .int("Enter an amount in whole cents")
  .positive("Enter an amount greater than zero")
  .max(MAX_AMOUNT_CENTS, "Amount is above the per-payment limit");

const memo = text().max(140, "Keep the memo under 140 characters");

export const createPaymentSchema = z.object({
  fromAccountId: z.uuid("Choose an account"),
  recipientId: z.uuid("Choose a recipient"),
  amountCents,
  method: z.enum(PAYMENT_METHODS),
  memo: memo.optional(),
  /** Future date (YYYY-MM-DD) to send on. Omit to send now. */
  scheduledFor: isoDate.optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createTransferSchema = z
  .object({
    fromAccountId: z.uuid("Choose an account"),
    toAccountId: z.uuid("Choose an account"),
    amountCents,
    memo: memo.optional(),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Choose two different accounts",
    path: ["toAccountId"],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const createRecipientSchema = z.object({
  name: text().min(2, "Enter the recipient's name").max(80),
  email: z
    .union([z.email("Enter a valid email"), z.literal("")])
    .optional()
    .transform((value) => value || undefined),
  bankName: text().min(2, "Enter the bank name").max(80),
  routingNumber: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "Routing numbers have 9 digits"),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,17}$/, "Account numbers have 6 to 17 digits"),
  defaultMethod: z.enum(PAYMENT_METHODS).default("ach"),
});
export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;

const limitCents = z
  .number("Enter a limit")
  .int()
  .min(100_00, "The minimum limit is $100")
  .max(250_000_00, "The maximum limit is $250,000");

export const createCardSchema = z.object({
  label: text().min(2, "Give the card a name").max(40),
  holderName: text().min(2, "Enter the cardholder's name").max(60),
  accountId: z.uuid("Choose an account"),
  monthlyLimitCents: limitCents,
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z
  .object({
    status: z.enum(CARD_STATUSES).optional(),
    monthlyLimitCents: limitCents.optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined || value.monthlyLimitCents !== undefined,
    { message: "Nothing to update" },
  );
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
