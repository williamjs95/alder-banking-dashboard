/**
 * Domain vocabulary shared by the database schema, the API contracts and the UI.
 * Keeping the literal unions in one place means a new category or status is a
 * one-line change that the compiler then walks through every layer.
 */

export const ACCOUNT_TYPES = ["checking", "savings", "treasury"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_STATUSES = [
  "posted",
  "pending",
  "scheduled",
  "failed",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Statuses that have already moved (or reserved) money and so count toward a balance. */
export const SETTLED_STATUSES = [
  "posted",
  "pending",
] as const satisfies readonly TransactionStatus[];

export const TRANSACTION_METHODS = [
  "ach",
  "wire",
  "card",
  "transfer",
  "interest",
] as const;
export type TransactionMethod = (typeof TRANSACTION_METHODS)[number];

export const PAYMENT_METHODS = [
  "ach",
  "wire",
] as const satisfies readonly TransactionMethod[];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CATEGORIES = [
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
  "interest",
  "transfer",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  revenue: "Revenue",
  payroll: "Payroll",
  taxes: "Taxes",
  rent: "Rent & office",
  cloud: "Cloud & infrastructure",
  software: "Software",
  marketing: "Marketing",
  travel: "Travel & meals",
  services: "Professional services",
  insurance: "Insurance & benefits",
  interest: "Interest",
  transfer: "Internal transfer",
  other: "Other",
};

export const METHOD_LABELS: Record<TransactionMethod, string> = {
  ach: "ACH",
  wire: "Wire",
  card: "Card",
  transfer: "Transfer",
  interest: "Interest",
};

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  posted: "Posted",
  pending: "Pending",
  scheduled: "Scheduled",
  failed: "Failed",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  treasury: "Treasury",
};

export const CARD_TYPES = ["virtual", "physical"] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_STATUSES = ["active", "frozen"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/**
 * How long a payment a person sends stays pending before it posts. Real ACH
 * takes a business day or more; the demo shortens it so the change is visible
 * within one visit.
 */
export const SETTLEMENT_DELAY_MS = 60_000;

/** Flat wire fee charged on outgoing wires, in cents. ACH is free. */
export const WIRE_FEE_CENTS = 1500;

export const WORKSPACE_COOKIE = "alder_workspace";
