// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SEEDS,
  CARD_SEEDS,
  RECIPIENT_SEEDS,
  RULES,
  TREASURY_SWEEP,
  type Day,
  type Rule,
} from "./catalog";

const day = (overrides: Partial<Day> = {}): Day => ({
  dom: 2,
  dow: 2,
  month: 3,
  isMonthEnd: false,
  progress: 1,
  ...overrides,
});

function rule(description: string): Rule {
  const found = RULES.find(
    (candidate) => candidate.description === description,
  );
  if (!found) throw new Error(`No rule named ${description}`);
  return found;
}

/** Days of the month (1-28) a rule fires on, in an ordinary month. */
const daysOfMonth = (target: Rule, overrides: Partial<Day> = {}) =>
  Array.from({ length: 28 }, (_, index) => index + 1).filter((dom) =>
    target.when(day({ dom, ...overrides })),
  );

describe("accounts, cards and recipients", () => {
  it("gives every account a 12-digit number and a 9-digit routing number", () => {
    for (const account of Object.values(ACCOUNT_SEEDS)) {
      expect(account.accountNumber).toMatch(/^\d{12}$/);
      expect(account.routingNumber).toMatch(/^\d{9}$/);
    }
  });

  it("keeps account numbers distinct, including their last four digits", () => {
    const last4 = Object.values(ACCOUNT_SEEDS).map((account) =>
      account.accountNumber.slice(-4),
    );

    expect(new Set(last4).size).toBe(3);
  });

  it("pays interest on savings and treasury but not on checking", () => {
    expect(ACCOUNT_SEEDS.checking.apyBps).toBe(0);
    expect(ACCOUNT_SEEDS.savings.apyBps).toBe(390);
    expect(ACCOUNT_SEEDS.treasury.apyBps).toBe(460);
  });

  it("gives every card a unique last four and a positive limit", () => {
    const cards = Object.values(CARD_SEEDS);

    expect(new Set(cards.map((card) => card.last4)).size).toBe(cards.length);
    for (const card of cards) {
      expect(card.last4).toMatch(/^\d{4}$/);
      expect(card.monthlyLimitCents).toBeGreaterThan(0);
    }
  });

  it("includes one frozen card so that state exists in the demo", () => {
    const frozen = Object.values(CARD_SEEDS).filter(
      (card) => card.status === "frozen",
    );

    expect(frozen.map((card) => card.label)).toEqual(["Events"]);
  });

  it("stores only the last four digits and a valid routing number per recipient", () => {
    for (const recipient of Object.values(RECIPIENT_SEEDS)) {
      expect(recipient.accountLast4).toMatch(/^\d{4}$/);
      expect(recipient.routingNumber).toMatch(/^\d{9}$/);
    }
  });
});

describe("transaction rules", () => {
  it("only points at cards and recipients that exist", () => {
    for (const candidate of RULES) {
      if (candidate.card) expect(CARD_SEEDS).toHaveProperty(candidate.card);
      if (candidate.recipient) {
        expect(RECIPIENT_SEEDS).toHaveProperty(candidate.recipient);
      }
    }
  });

  it("names a payment to a saved recipient after that recipient", () => {
    const linked = RULES.filter((candidate) => candidate.recipient);

    expect(linked).toHaveLength(3);
    for (const candidate of linked) {
      expect(candidate.description).toBe(
        RECIPIENT_SEEDS[candidate.recipient!].name,
      );
    }
  });

  it("uses a card for every card purchase and for nothing else", () => {
    for (const candidate of RULES) {
      expect(candidate.card !== undefined).toBe(candidate.method === "card");
    }
  });

  it("treats revenue as money in and every other category as money out", () => {
    for (const candidate of RULES) {
      expect(candidate.sign).toBe(candidate.category === "revenue" ? 1 : -1);
    }
  });

  it("uses positive dollar ranges with the lower bound first", () => {
    for (const candidate of RULES) {
      const [min, max] = candidate.dollars;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
    }
  });

  it("only schedules ahead outgoing ACH payments on fixed calendar days", () => {
    const schedulable = RULES.filter((candidate) => candidate.schedulable);

    expect(schedulable.map((candidate) => candidate.description)).toEqual([
      "Gusto Payroll",
      "Gusto Tax",
      "Justworks Health",
      "Guideline 401(k)",
      "Vouch Insurance",
      "WeWork · 600 Congress Ave",
      "Pilot.com, Inc.",
    ]);
    for (const candidate of schedulable) {
      expect(candidate.method).toBe("ach");
      expect(candidate.sign).toBe(-1);
      expect(candidate.probability).toBeUndefined();
    }
  });

  it("pays out Stripe on Mondays, Wednesdays and Fridays", () => {
    const stripe = rule("Stripe");
    const payoutDays = [0, 1, 2, 3, 4, 5, 6].filter((dow) =>
      stripe.when(day({ dow })),
    );

    expect(payoutDays).toEqual([1, 3, 5]);
  });

  it("runs payroll and payroll tax on the 15th and on the last day of the month", () => {
    for (const name of ["Gusto Payroll", "Gusto Tax"]) {
      expect(daysOfMonth(rule(name))).toEqual([15]);
      expect(rule(name).when(day({ dom: 30, isMonthEnd: true }))).toBe(true);
      expect(rule(name).when(day({ dom: 30, isMonthEnd: false }))).toBe(false);
    }
  });

  it("charges monthly bills on their own day of the month", () => {
    expect(daysOfMonth(rule("WeWork · 600 Congress Ave"))).toEqual([1]);
    expect(daysOfMonth(rule("Northgate Health"))).toEqual([6]);
    expect(daysOfMonth(rule("Vouch Insurance"))).toEqual([7]);
    expect(daysOfMonth(rule("Pilot.com, Inc."))).toEqual([10]);
    expect(daysOfMonth(rule("Halcyon Robotics"))).toEqual([14]);
    expect(daysOfMonth(rule("Guideline 401(k)"))).toEqual([16]);
  });

  it("bills legal fees on the 18th of the first month of each quarter", () => {
    const legal = rule("Gunderson Dettmer LLP");
    const months = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(
      months.filter((month) => legal.when(day({ dom: 18, month }))),
    ).toEqual([1, 4, 7, 10]);
    expect(legal.when(day({ dom: 17, month: 1 }))).toBe(false);
  });

  it("pays estimated taxes on the 15th of January, April, June and September", () => {
    const irs = rule("IRS USATAXPYMT");
    const months = Array.from({ length: 12 }, (_, index) => index + 1);

    expect(months.filter((month) => irs.when(day({ dom: 15, month })))).toEqual(
      [1, 4, 6, 9],
    );
    expect(irs.when(day({ dom: 14, month: 6 }))).toBe(false);
  });

  it("starts Meridian Freight only once the year is 42% through", () => {
    const meridian = rule("Meridian Freight");

    expect(meridian.when(day({ dom: 22, progress: 0.42 }))).toBe(false);
    expect(meridian.when(day({ dom: 22, progress: 0.43 }))).toBe(true);
    expect(meridian.when(day({ dom: 21, progress: 0.9 }))).toBe(false);
  });

  it("keeps discretionary card spend to weekdays and makes it occasional", () => {
    const discretionary = RULES.filter(
      (candidate) =>
        candidate.category === "travel" ||
        candidate.category === "marketing" ||
        candidate.description === "Amazon Business",
    );

    expect(discretionary).toHaveLength(12);
    for (const candidate of discretionary) {
      const firingDays = [0, 1, 2, 3, 4, 5, 6].filter((dow) =>
        candidate.when(day({ dow })),
      );
      expect(firingDays).toEqual([1, 2, 3, 4, 5]);
      expect(candidate.probability).toBeGreaterThan(0);
      expect(candidate.probability).toBeLessThan(1);
    }
  });

  it("charges each SaaS subscription a fixed price once a month on the software card", () => {
    const subscriptions = RULES.filter(
      (candidate) =>
        candidate.category === "software" && candidate.description !== "OpenAI",
    );

    expect(subscriptions).toHaveLength(9);
    for (const subscription of subscriptions) {
      expect(subscription.dollars[0]).toBe(subscription.dollars[1]);
      expect(subscription.scale).toBe("none");
      expect(subscription.card).toBe("software");
      expect(daysOfMonth(subscription)).toHaveLength(1);
    }
  });

  it("charges usage-priced cloud and AI bills once a month", () => {
    expect(daysOfMonth(rule("Amazon Web Services"))).toEqual([3]);
    expect(daysOfMonth(rule("OpenAI"))).toEqual([4]);
    expect(daysOfMonth(rule("Vercel"))).toEqual([8]);
    expect(daysOfMonth(rule("Datadog"))).toEqual([11]);
    expect(daysOfMonth(rule("Cloudflare"))).toEqual([19]);
  });
});

describe("treasury sweep", () => {
  it("tops up checking with $60,000 on the 5th", () => {
    expect(TREASURY_SWEEP).toEqual({ dom: 5, cents: 6_000_000 });
  });
});
