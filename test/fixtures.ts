import type {
  AccountDto,
  CardDto,
  InsightsDto,
  OverviewDto,
  RecipientDto,
  TransactionDto,
  TransactionListDto,
} from "@/lib/contracts";

/** Small, hand-written API payloads for component tests. */

export const ids = {
  checking: "11111111-1111-4111-8111-111111111111",
  savings: "22222222-2222-4222-8222-222222222222",
  treasury: "33333333-3333-4333-8333-333333333333",
  txStripe: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  txAws: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  txTransfer: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  txScheduled: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  txFailed: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  cardCloud: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  cardEvents: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  recipientPilot: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  recipientGunderson: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
} as const;

export const accounts: AccountDto[] = [
  {
    id: ids.checking,
    name: "Operating Checking",
    type: "checking",
    last4: "4821",
    balanceCents: 250_000_00,
    apyBps: 0,
  },
  {
    id: ids.savings,
    name: "Savings Reserve",
    type: "savings",
    last4: "7730",
    balanceCents: 600_000_00,
    apyBps: 390,
  },
  {
    id: ids.treasury,
    name: "Treasury",
    type: "treasury",
    last4: "1094",
    balanceCents: 900_000_00,
    apyBps: 460,
  },
];

const baseTransaction: TransactionDto = {
  id: ids.txStripe,
  accountId: ids.checking,
  accountName: "Operating Checking",
  postedAt: "2026-06-17T15:51:00.000Z",
  description: "Stripe",
  amountCents: 11_048_20,
  category: "revenue",
  method: "ach",
  status: "posted",
  reference: "ALD-STRIPE01",
  note: null,
  cardId: null,
  cardLabel: null,
  cardLast4: null,
  recipientId: null,
  counterpartyAccountName: null,
};

export const transactions = {
  stripe: baseTransaction,
  aws: {
    ...baseTransaction,
    id: ids.txAws,
    postedAt: "2026-06-03T10:12:00.000Z",
    description: "Amazon Web Services",
    amountCents: -15_137_39,
    category: "cloud",
    method: "card",
    status: "pending",
    reference: "ALD-AWS00001",
    note: "June invoice",
    cardId: ids.cardCloud,
    cardLabel: "Cloud infrastructure",
    cardLast4: "4417",
  },
  transfer: {
    ...baseTransaction,
    id: ids.txTransfer,
    accountId: ids.treasury,
    accountName: "Treasury",
    postedAt: "2026-06-05T09:00:00.000Z",
    description: "Transfer to Operating Checking",
    amountCents: -60_000_00,
    category: "transfer",
    method: "transfer",
    reference: "ALD-XFER0001",
    counterpartyAccountName: "Operating Checking",
  },
  scheduled: {
    ...baseTransaction,
    id: ids.txScheduled,
    postedAt: "2026-06-30T15:00:00.000Z",
    description: "Gusto Payroll",
    amountCents: -75_725_95,
    category: "payroll",
    status: "scheduled",
    reference: "ALD-PAYROLL1",
  },
  failed: {
    ...baseTransaction,
    id: ids.txFailed,
    postedAt: "2026-05-26T12:00:00.000Z",
    description: "Hartwell Staffing",
    amountCents: -4_200_00,
    category: "services",
    status: "failed",
    reference: "ALD-FAILED01",
    note: "Returned by receiving bank (R03: no account, unable to locate).",
    recipientId: ids.recipientPilot,
  },
} satisfies Record<string, TransactionDto>;

export const transactionList: TransactionListDto = {
  items: [
    transactions.scheduled,
    transactions.stripe,
    transactions.transfer,
    transactions.aws,
    transactions.failed,
  ],
  total: 5,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  summary: {
    inflowCents: 11_048_20,
    outflowCents: 150_863_34,
    netCents: -139_815_14,
  },
};

export const recipients: RecipientDto[] = [
  {
    id: ids.recipientGunderson,
    name: "Gunderson Dettmer LLP",
    email: "accounting@gunder.example",
    bankName: "First Republic",
    accountLast4: "7715",
    defaultMethod: "wire",
    createdAt: "2025-09-01T00:00:00.000Z",
  },
  {
    id: ids.recipientPilot,
    name: "Pilot.com, Inc.",
    email: null,
    bankName: "Silicon Valley Bank",
    accountLast4: "4406",
    defaultMethod: "ach",
    createdAt: "2025-08-01T00:00:00.000Z",
  },
];

export const cards: CardDto[] = [
  {
    id: ids.cardCloud,
    accountId: ids.checking,
    accountName: "Operating Checking",
    label: "Cloud infrastructure",
    holderName: "Maya Chen",
    last4: "4417",
    type: "virtual",
    status: "active",
    monthlyLimitCents: 25_000_00,
    spentThisMonthCents: 15_137_39,
    expMonth: 6,
    expYear: 2028,
  },
  {
    id: ids.cardEvents,
    accountId: ids.checking,
    accountName: "Operating Checking",
    label: "Events",
    holderName: "Jordan Reyes",
    last4: "1186",
    type: "virtual",
    status: "frozen",
    monthlyLimitCents: 5_000_00,
    spentThisMonthCents: 0,
    expMonth: 4,
    expYear: 2029,
  },
];

/** `count` consecutive daily points ending on 2026-06-18, rising by $1,000 a day. */
export function balanceSeries(count: number, endCents = 1_750_000_00) {
  const end = Date.UTC(2026, 5, 18);
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(end - (count - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    balanceCents: endCents - (count - 1 - index) * 1_000_00,
  }));
}

export const overview: OverviewDto = {
  totalBalanceCents: 1_750_000_00,
  accounts,
  balanceSeries: balanceSeries(365),
  last30Days: { inflowCents: 212_062_00, outflowCents: 274_530_00 },
  previous30Days: { inflowCents: 205_000_00, outflowCents: 263_000_00 },
  cashflow: [
    {
      month: "2026-04",
      inflowCents: 200_000_00,
      outflowCents: 260_000_00,
      netCents: -60_000_00,
    },
    {
      month: "2026-05",
      inflowCents: 210_000_00,
      outflowCents: 265_000_00,
      netCents: -55_000_00,
    },
    {
      month: "2026-06",
      inflowCents: 130_000_00,
      outflowCents: 160_000_00,
      netCents: -30_000_00,
    },
  ],
  spendByCategory: [
    { category: "payroll", cents: 152_329_00 },
    { category: "taxes", cents: 42_835_00 },
    { category: "cloud", cents: 18_328_00 },
  ],
  monthlyBurnCents: 60_814_00,
  runwayMonths: 28.7,
  recent: [transactions.stripe, transactions.aws, transactions.failed],
  upcoming: [transactions.scheduled],
};

export const insights: InsightsDto = {
  categoryTrend: [
    {
      month: "2026-05",
      totals: {
        payroll: 150_000_00,
        taxes: 42_000_00,
        cloud: 16_000_00,
        marketing: 14_000_00,
        insurance: 12_000_00,
        software: 8_000_00,
        rent: 8_400_00,
      },
    },
    {
      month: "2026-06",
      totals: {
        payroll: 76_000_00,
        taxes: 21_000_00,
        cloud: 15_000_00,
        marketing: 9_000_00,
        insurance: 11_000_00,
        software: 6_000_00,
      },
    },
  ],
  trendCategories: [
    "payroll",
    "taxes",
    "cloud",
    "marketing",
    "insurance",
    "software",
    "rent",
  ],
  topMerchants: [
    { description: "Gusto Payroll", cents: 450_848_00, count: 6 },
    { description: "Amazon Web Services", cents: 41_899_00, count: 3 },
    { description: "Gunderson Dettmer LLP", cents: 9_876_00, count: 1 },
  ],
  categoryComparison: [
    {
      category: "payroll",
      currentCents: 152_329_00,
      previousCents: 149_160_00,
    },
    { category: "taxes", currentCents: 42_835_00, previousCents: 51_072_00 },
    { category: "rent", currentCents: 8_400_00, previousCents: 8_400_00 },
    { category: "travel", currentCents: 0, previousCents: 1_525_00 },
  ],
  averageMonthlySpendCents: 261_926_00,
  averageMonthlyRevenueCents: 201_113_00,
  largestExpense: transactions.scheduled,
};
