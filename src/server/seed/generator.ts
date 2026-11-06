import { randomUUID } from "node:crypto";
import { SETTLED_STATUSES, type TransactionStatus } from "@/lib/domain";
import type {
  NewAccountRow,
  NewCardRow,
  NewRecipientRow,
  NewTransactionRow,
} from "@/server/db/schema";
import {
  ACCOUNT_SEEDS,
  CARD_SEEDS,
  COMPANY_NAME,
  RECIPIENT_SEEDS,
  RULES,
  TREASURY_SWEEP,
  type AccountKey,
  type CardKey,
  type Day,
  type RecipientKey,
  type Rule,
} from "./catalog";
import { createRng, type Rng } from "./prng";

export const DEFAULT_SEED = 20_260_611;
export const HISTORY_DAYS = 365;
export const SCHEDULE_DAYS = 21;
/** Card and ACH activity from the last couple of days has not settled yet. */
const PENDING_WINDOW_DAYS = 1;

const DAY_MS = 86_400_000;

type WithId<T> = T & { id: string };

export type SeedData = {
  workspace: { id: string; companyName: string; createdAt: Date };
  accounts: WithId<NewAccountRow>[];
  recipients: WithId<NewRecipientRow>[];
  cards: WithId<NewCardRow>[];
  transactions: WithId<NewTransactionRow>[];
};

export type SeedOptions = {
  workspaceId: string;
  now: Date;
  /** Drives every random choice. Same seed and `now` give the same company. */
  seed?: number;
  /** Row ids must be globally unique, so they do not come from the seeded RNG. */
  newId?: () => string;
};

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function describeDay(dayStart: number, offset: number): Day {
  const date = new Date(dayStart);
  const tomorrow = new Date(dayStart + DAY_MS);
  return {
    dom: date.getUTCDate(),
    dow: date.getUTCDay(),
    month: date.getUTCMonth() + 1,
    isMonthEnd: tomorrow.getUTCDate() === 1,
    progress: Math.min(1, (HISTORY_DAYS + offset) / HISTORY_DAYS),
  };
}

function scaleFor(rule: Rule, progress: number): number {
  if (rule.scale === "revenue") return 0.7 + 0.3 * progress;
  if (rule.scale === "expense") return 0.85 + 0.15 * progress;
  return 1;
}

function amountFor(rule: Rule, day: Day, rng: Rng): number {
  const [min, max] = rule.dollars;
  // Fixed-price contracts and subscriptions stay on round numbers.
  const base = min === max ? min * 100 : rng.int(min * 100, max * 100);
  return rule.sign * Math.round(base * scaleFor(rule, day.progress));
}

function reference(rng: Rng): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "ALD-";
  for (let i = 0; i < 8; i++) out += alphabet[rng.int(0, alphabet.length - 1)];
  return out;
}

function statusFor(
  rule: Pick<Rule, "method">,
  offset: number,
): TransactionStatus {
  if (offset > 0) return "scheduled";
  const settlesSlowly = rule.method === "card" || rule.method === "ach";
  return settlesSlowly && offset >= -PENDING_WINDOW_DAYS ? "pending" : "posted";
}

/**
 * Builds one year of banking history for a workspace, plus a few weeks of
 * scheduled payments. Pure: all randomness comes from the seed and all time
 * from `now`, so the result is fully reproducible.
 */
export function generateSeed({
  workspaceId,
  now,
  seed = DEFAULT_SEED,
  newId = randomUUID,
}: SeedOptions): SeedData {
  const rng = createRng(seed);
  const today = startOfUtcDay(now);

  const accountIds = {} as Record<AccountKey, string>;
  const balances = {} as Record<AccountKey, number>;
  const accountKeys = Object.keys(ACCOUNT_SEEDS) as AccountKey[];
  for (const key of accountKeys) {
    accountIds[key] = newId();
    balances[key] = ACCOUNT_SEEDS[key].openingCents;
  }

  const cardIds = {} as Record<CardKey, string>;
  const cardKeys = Object.keys(CARD_SEEDS) as CardKey[];
  for (const key of cardKeys) cardIds[key] = newId();

  const recipientIds = {} as Record<RecipientKey, string>;
  const recipientKeys = Object.keys(RECIPIENT_SEEDS) as RecipientKey[];
  for (const key of recipientKeys) recipientIds[key] = newId();

  const transactions: SeedData["transactions"] = [];

  const timeOn = (dayStart: number) => {
    const at = dayStart + rng.int(8 * 60, 18 * 60) * 60_000;
    // Nothing settled or pending can be dated after "now".
    return at > now.getTime() && dayStart <= today
      ? new Date(now.getTime() - rng.int(5, 90) * 60_000)
      : new Date(at);
  };

  const record = (
    row: Omit<NewTransactionRow, "workspaceId" | "reference"> & {
      account: AccountKey;
    },
  ) => {
    const { account, ...rest } = row;
    if ((SETTLED_STATUSES as readonly string[]).includes(rest.status)) {
      balances[account] += rest.amountCents;
    }
    transactions.push({
      id: newId(),
      workspaceId,
      reference: reference(rng),
      ...rest,
    });
  };

  for (let offset = -(HISTORY_DAYS - 1); offset <= SCHEDULE_DAYS; offset++) {
    const dayStart = today + offset * DAY_MS;
    const day = describeDay(dayStart, offset);
    const isFuture = offset > 0;

    for (const rule of RULES) {
      if (isFuture && !rule.schedulable) continue;
      if (!rule.when(day)) continue;
      if (rule.probability !== undefined && !rng.chance(rule.probability)) {
        continue;
      }
      record({
        account: rule.account,
        accountId: accountIds[rule.account],
        postedAt: timeOn(dayStart),
        description: rule.description,
        amountCents: amountFor(rule, day, rng),
        category: rule.category,
        method: rule.method,
        status: statusFor(rule, offset),
        cardId: rule.card ? cardIds[rule.card] : null,
        recipientId: rule.recipient ? recipientIds[rule.recipient] : null,
      });
    }

    if (isFuture) continue;

    if (day.dom === TREASURY_SWEEP.dom) {
      const postedAt = timeOn(dayStart);
      const status = statusFor({ method: "transfer" }, offset);
      record({
        account: "treasury",
        accountId: accountIds.treasury,
        counterpartyAccountId: accountIds.checking,
        postedAt,
        description: `Transfer to ${ACCOUNT_SEEDS.checking.name}`,
        amountCents: -TREASURY_SWEEP.cents,
        category: "transfer",
        method: "transfer",
        status,
      });
      record({
        account: "checking",
        accountId: accountIds.checking,
        counterpartyAccountId: accountIds.treasury,
        postedAt,
        description: `Transfer from ${ACCOUNT_SEEDS.treasury.name}`,
        amountCents: TREASURY_SWEEP.cents,
        category: "transfer",
        method: "transfer",
        status,
      });
    }

    if (day.isMonthEnd) {
      for (const key of accountKeys) {
        const { apyBps } = ACCOUNT_SEEDS[key];
        if (apyBps === 0) continue;
        record({
          account: key,
          accountId: accountIds[key],
          postedAt: timeOn(dayStart),
          description: "Interest earned",
          amountCents: Math.round((balances[key] * apyBps) / 10_000 / 12),
          category: "interest",
          method: "interest",
          status: statusFor({ method: "interest" }, offset),
        });
      }
    }
  }

  // One returned payment, so the failed state exists in the demo.
  record({
    account: "checking",
    accountId: accountIds.checking,
    postedAt: timeOn(today - 23 * DAY_MS),
    description: RECIPIENT_SEEDS.hartwell.name,
    amountCents: -4_200_00,
    category: "services",
    method: "ach",
    status: "failed",
    recipientId: recipientIds.hartwell,
    note: "Returned by receiving bank (R03: no account, unable to locate).",
  });

  transactions.sort(
    (a, b) => (a.postedAt as Date).getTime() - (b.postedAt as Date).getTime(),
  );

  const expiry = new Date(today);
  return {
    workspace: { id: workspaceId, companyName: COMPANY_NAME, createdAt: now },
    accounts: accountKeys.map((key, index) => ({
      id: accountIds[key],
      workspaceId,
      name: ACCOUNT_SEEDS[key].name,
      type: key,
      accountNumber: ACCOUNT_SEEDS[key].accountNumber,
      routingNumber: ACCOUNT_SEEDS[key].routingNumber,
      balanceCents: balances[key],
      apyBps: ACCOUNT_SEEDS[key].apyBps,
      sortOrder: index,
    })),
    recipients: recipientKeys.map((key, index) => ({
      id: recipientIds[key],
      workspaceId,
      ...RECIPIENT_SEEDS[key],
      createdAt: new Date(today - (300 - index * 40) * DAY_MS),
    })),
    cards: cardKeys.map((key, index) => ({
      id: cardIds[key],
      workspaceId,
      accountId: accountIds.checking,
      ...CARD_SEEDS[key],
      expMonth: ((expiry.getUTCMonth() + index * 2) % 12) + 1,
      expYear: expiry.getUTCFullYear() + 2 + (index % 2),
      createdAt: new Date(today - (330 - index * 30) * DAY_MS),
    })),
    transactions,
  };
}
