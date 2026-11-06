import type { Category, PaymentMethod, TransactionMethod } from "@/lib/domain";

/**
 * The fictional company behind every demo workspace, described as data.
 * The generator walks a calendar and asks each rule whether it fires that day.
 */

export const COMPANY_NAME = "Brightline Labs, Inc.";
export const ACCOUNT_HOLDER = "Maya Chen";

export type AccountKey = "checking" | "savings" | "treasury";
export type CardKey =
  "cloud" | "software" | "marketing" | "travel" | "office" | "events";
export type RecipientKey =
  "wework" | "pilot" | "gunderson" | "hartwell" | "oakline" | "kestrel";

export const ACCOUNT_SEEDS: Record<
  AccountKey,
  {
    name: string;
    accountNumber: string;
    routingNumber: string;
    openingCents: number;
    apyBps: number;
  }
> = {
  checking: {
    name: "Operating Checking",
    accountNumber: "202418874821",
    routingNumber: "114924742",
    openingCents: 420_000_00,
    apyBps: 0,
  },
  savings: {
    name: "Savings Reserve",
    accountNumber: "202418877730",
    routingNumber: "114924742",
    openingCents: 600_000_00,
    apyBps: 390,
  },
  treasury: {
    name: "Treasury",
    accountNumber: "202418871094",
    routingNumber: "114924742",
    openingCents: 1_500_000_00,
    apyBps: 460,
  },
};

export const CARD_SEEDS: Record<
  CardKey,
  {
    label: string;
    holderName: string;
    last4: string;
    type: "virtual" | "physical";
    status: "active" | "frozen";
    monthlyLimitCents: number;
  }
> = {
  cloud: {
    label: "Cloud infrastructure",
    holderName: "Maya Chen",
    last4: "4417",
    type: "virtual",
    status: "active",
    monthlyLimitCents: 25_000_00,
  },
  software: {
    label: "Software & SaaS",
    holderName: "Maya Chen",
    last4: "8203",
    type: "virtual",
    status: "active",
    monthlyLimitCents: 15_000_00,
  },
  marketing: {
    label: "Marketing",
    holderName: "Jordan Reyes",
    last4: "5961",
    type: "virtual",
    status: "active",
    monthlyLimitCents: 25_000_00,
  },
  travel: {
    label: "Travel & meals",
    holderName: "Priya Patel",
    last4: "3078",
    type: "physical",
    status: "active",
    monthlyLimitCents: 8_000_00,
  },
  office: {
    label: "Office",
    holderName: "Sam Okafor",
    last4: "7742",
    type: "physical",
    status: "active",
    monthlyLimitCents: 3_000_00,
  },
  events: {
    label: "Events",
    holderName: "Jordan Reyes",
    last4: "1186",
    type: "virtual",
    status: "frozen",
    monthlyLimitCents: 5_000_00,
  },
};

export const RECIPIENT_SEEDS: Record<
  RecipientKey,
  {
    name: string;
    email: string | null;
    bankName: string;
    accountLast4: string;
    routingNumber: string;
    defaultMethod: PaymentMethod;
  }
> = {
  wework: {
    name: "WeWork · 600 Congress Ave",
    email: "billing@wework.example",
    bankName: "JPMorgan Chase",
    accountLast4: "0931",
    routingNumber: "021000021",
    defaultMethod: "ach",
  },
  pilot: {
    name: "Pilot.com, Inc.",
    email: "ar@pilot.example",
    bankName: "Silicon Valley Bank",
    accountLast4: "4406",
    routingNumber: "121140399",
    defaultMethod: "ach",
  },
  gunderson: {
    name: "Gunderson Dettmer LLP",
    email: "accounting@gunder.example",
    bankName: "First Republic",
    accountLast4: "7715",
    routingNumber: "321081669",
    defaultMethod: "wire",
  },
  hartwell: {
    name: "Hartwell Staffing",
    email: "payments@hartwell.example",
    bankName: "Wells Fargo",
    accountLast4: "2258",
    routingNumber: "121000248",
    defaultMethod: "ach",
  },
  oakline: {
    name: "Oakline Design Studio",
    email: "hello@oakline.example",
    bankName: "Bank of America",
    accountLast4: "6640",
    routingNumber: "026009593",
    defaultMethod: "ach",
  },
  kestrel: {
    name: "Kestrel Analytics",
    email: null,
    bankName: "Citibank",
    accountLast4: "9012",
    routingNumber: "021000089",
    defaultMethod: "wire",
  },
};

/** Calendar facts about the day a rule is being evaluated for. */
export type Day = {
  /** Day of month, 1-31. */
  dom: number;
  /** Day of week, 0 = Sunday. */
  dow: number;
  /** Month, 1-12. */
  month: number;
  isMonthEnd: boolean;
  /** 0 at the start of the generated year, 1 today. Lets the company grow. */
  progress: number;
};

export type Scale = "revenue" | "expense" | "none";

/** A transaction template. Amounts are whole dollars; cents are randomized. */
export type Rule = {
  description: string;
  category: Category;
  method: TransactionMethod;
  account: AccountKey;
  /** +1 for money in, -1 for money out. */
  sign: 1 | -1;
  /** Inclusive dollar range before scaling. Equal bounds mean a fixed amount. */
  dollars: readonly [number, number];
  scale: Scale;
  /** Whether the rule fires on a given day. */
  when: (day: Day) => boolean;
  /** Fires only with this probability once `when` matches. Defaults to 1. */
  probability?: number;
  card?: CardKey;
  recipient?: RecipientKey;
  /** Known in advance, so future occurrences show up as scheduled payments. */
  schedulable?: boolean;
};

const onDay = (dom: number) => (day: Day) => day.dom === dom;
const weekday = (day: Day) => day.dow >= 1 && day.dow <= 5;
const quarterly = (months: number[], dom: number) => (day: Day) =>
  day.dom === dom && months.includes(day.month);
const paydays = (day: Day) => day.dom === 15 || day.isMonthEnd;

const saas = (description: string, dom: number, dollars: number): Rule => ({
  description,
  category: "software",
  method: "card",
  account: "checking",
  sign: -1,
  dollars: [dollars, dollars],
  scale: "none",
  when: onDay(dom),
  card: "software",
});

const travel = (
  description: string,
  dollars: readonly [number, number],
  probability: number,
): Rule => ({
  description,
  category: "travel",
  method: "card",
  account: "checking",
  sign: -1,
  dollars,
  scale: "none",
  when: weekday,
  probability,
  card: "travel",
});

const ads = (
  description: string,
  dollars: readonly [number, number],
  probability: number,
): Rule => ({
  description,
  category: "marketing",
  method: "card",
  account: "checking",
  sign: -1,
  dollars,
  scale: "expense",
  when: weekday,
  probability,
  card: "marketing",
});

export const RULES: readonly Rule[] = [
  // Revenue
  {
    description: "Stripe",
    category: "revenue",
    method: "ach",
    account: "checking",
    sign: 1,
    dollars: [6_500, 13_500],
    scale: "revenue",
    when: (day) => day.dow === 1 || day.dow === 3 || day.dow === 5,
  },
  {
    description: "Northgate Health",
    category: "revenue",
    method: "wire",
    account: "checking",
    sign: 1,
    dollars: [32_000, 32_000],
    scale: "none",
    when: onDay(6),
  },
  {
    description: "Halcyon Robotics",
    category: "revenue",
    method: "ach",
    account: "checking",
    sign: 1,
    dollars: [24_500, 24_500],
    scale: "none",
    when: onDay(14),
  },
  {
    // A customer signed part-way through the year.
    description: "Meridian Freight",
    category: "revenue",
    method: "ach",
    account: "checking",
    sign: 1,
    dollars: [18_750, 18_750],
    scale: "none",
    when: (day) => day.dom === 22 && day.progress > 0.42,
  },

  // People
  {
    description: "Gusto Payroll",
    category: "payroll",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [74_000, 79_000],
    scale: "expense",
    when: paydays,
    schedulable: true,
  },
  {
    description: "Gusto Tax",
    category: "taxes",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [20_000, 22_000],
    scale: "expense",
    when: paydays,
    schedulable: true,
  },
  {
    description: "Justworks Health",
    category: "insurance",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [7_200, 7_900],
    scale: "expense",
    when: onDay(1),
    schedulable: true,
  },
  {
    description: "Guideline 401(k)",
    category: "insurance",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [3_100, 3_600],
    scale: "none",
    when: onDay(16),
    schedulable: true,
  },
  {
    description: "Vouch Insurance",
    category: "insurance",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [1_240, 1_240],
    scale: "none",
    when: onDay(7),
    schedulable: true,
  },

  // Facilities and services
  {
    description: "WeWork · 600 Congress Ave",
    category: "rent",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [8_400, 8_400],
    scale: "none",
    when: onDay(1),
    recipient: "wework",
    schedulable: true,
  },
  {
    description: "Pilot.com, Inc.",
    category: "services",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [1_950, 1_950],
    scale: "none",
    when: onDay(10),
    recipient: "pilot",
    schedulable: true,
  },
  {
    description: "Gunderson Dettmer LLP",
    category: "services",
    method: "wire",
    account: "checking",
    sign: -1,
    dollars: [6_500, 14_000],
    scale: "none",
    when: quarterly([1, 4, 7, 10], 18),
    recipient: "gunderson",
  },
  {
    description: "IRS USATAXPYMT",
    category: "taxes",
    method: "ach",
    account: "checking",
    sign: -1,
    dollars: [9_000, 15_000],
    scale: "none",
    when: quarterly([1, 4, 6, 9], 15),
  },

  // Cloud
  {
    description: "Amazon Web Services",
    category: "cloud",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [11_500, 15_500],
    scale: "expense",
    when: onDay(3),
    card: "cloud",
  },
  {
    description: "Vercel",
    category: "cloud",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [640, 980],
    scale: "none",
    when: onDay(8),
    card: "cloud",
  },
  {
    description: "Datadog",
    category: "cloud",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [1_850, 2_400],
    scale: "none",
    when: onDay(11),
    card: "cloud",
  },
  {
    description: "Cloudflare",
    category: "cloud",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [200, 260],
    scale: "none",
    when: onDay(19),
    card: "cloud",
  },

  // Software
  saas("Google Workspace", 1, 864),
  saas("Slack", 2, 1_312),
  saas("Notion", 5, 480),
  saas("Figma", 9, 675),
  saas("GitHub", 12, 1_134),
  saas("Linear", 13, 420),
  saas("Zoom", 17, 299),
  saas("HubSpot", 20, 1_780),
  saas("1Password", 23, 199),
  {
    description: "OpenAI",
    category: "software",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [900, 2_400],
    scale: "expense",
    when: onDay(4),
    card: "software",
  },

  // Marketing
  ads("Google Ads", [600, 2_400], 0.3),
  ads("LinkedIn Ads", [400, 1_800], 0.14),
  ads("Meta Ads", [250, 1_200], 0.08),

  // Travel and meals
  travel("Delta Air Lines", [180, 720], 0.05),
  travel("United Airlines", [160, 680], 0.04),
  travel("Marriott", [210, 640], 0.04),
  travel("Uber", [14, 68], 0.12),
  travel("Lyft", [12, 54], 0.06),
  travel("DoorDash", [28, 140], 0.1),
  travel("Sweetgreen", [14, 90], 0.08),
  travel("Blue Bottle Coffee", [6, 38], 0.07),

  // Office
  {
    description: "Amazon Business",
    category: "other",
    method: "card",
    account: "checking",
    sign: -1,
    dollars: [40, 420],
    scale: "none",
    when: weekday,
    probability: 0.11,
    card: "office",
  },
];

/** Monthly top-up that keeps Operating Checking funded from Treasury. */
export const TREASURY_SWEEP = { dom: 5, cents: 60_000_00 } as const;
