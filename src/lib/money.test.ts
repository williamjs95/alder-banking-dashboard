import { describe, expect, it } from "vitest";
import {
  formatApy,
  formatCompactMoney,
  formatMoney,
  formatPercent,
  parseMoneyInput,
  percentChange,
  toMoneyInput,
} from "./money";

describe("formatMoney", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [123_450, "$1,234.50"],
    [1_750_000_00, "$1,750,000.00"],
    [-20_00, "-$20.00"],
  ])("formats %d cents as %s", (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  it("prefixes positive amounts with a plus when signed", () => {
    expect(formatMoney(123_450, { signed: true })).toBe("+$1,234.50");
  });

  it("never signs zero, and keeps the minus on negatives", () => {
    expect(formatMoney(0, { signed: true })).toBe("$0.00");
    expect(formatMoney(-123_450, { signed: true })).toBe("-$1,234.50");
  });

  it("drops the cents when whole, rounding to the nearest dollar", () => {
    expect(formatMoney(123_450, { whole: true })).toBe("$1,235");
    expect(formatMoney(123_449, { whole: true })).toBe("$1,234");
    expect(formatMoney(-60_000_00, { whole: true, signed: true })).toBe(
      "-$60,000",
    );
    expect(formatMoney(60_000_00, { whole: true, signed: true })).toBe(
      "+$60,000",
    );
  });
});

describe("formatCompactMoney", () => {
  it.each([
    [1_200_000_00, "$1.2M"],
    [48_300_00, "$48.3K"],
    [950_00, "$950"],
    [1_234_56, "$1.23K"],
    [0, "$0"],
    [-48_300_00, "-$48.3K"],
  ])("formats %d cents as %s", (cents, expected) => {
    expect(formatCompactMoney(cents)).toBe(expected);
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["12.34", 12_34],
    ["1250", 1_250_00],
    ["1,250", 1_250_00],
    ["$1250.5", 1_250_50],
    ["$1,250.50", 1_250_50],
    [" 12 ", 12_00],
    ["12.", 12_00],
    ["0.07", 7],
    ["0", 0],
    // Floating point would give 1998.9999999999998 for 19.99 * 100.
    ["19.99", 19_99],
  ])("reads %j as %d cents", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["abc", "letters"],
    ["1.999", "more than two decimals"],
    ["-5", "negative"],
    [".5", "no leading digit"],
    ["1.2.3", "two decimal points"],
    ["1e3", "exponent notation"],
    ["12 USD", "a currency code"],
  ])("rejects %j (%s)", (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });

  it("rejects amounts too large to hold exactly in cents", () => {
    expect(parseMoneyInput("99999999999999999999")).toBeNull();
  });
});

describe("toMoneyInput", () => {
  it.each([
    [125_050, "1,250.50"],
    [7, "0.07"],
    [0, "0.00"],
    [1_000_000_00, "1,000,000.00"],
  ])("writes %d cents as %j", (cents, expected) => {
    expect(toMoneyInput(cents)).toBe(expected);
  });

  it("round-trips through parseMoneyInput", () => {
    for (const cents of [0, 1, 99, 100, 19_99, 125_050, 10_000_000_00]) {
      expect(parseMoneyInput(toMoneyInput(cents))).toBe(cents);
    }
  });
});

describe("percentChange", () => {
  it("is the change relative to the previous value", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(75, 100)).toBe(-25);
    expect(percentChange(100, 100)).toBe(0);
  });

  it("measures against the size of a negative base", () => {
    // Net flow improving from -200 to -100 is a 50% rise, not a fall.
    expect(percentChange(-100, -200)).toBe(50);
    expect(percentChange(-300, -200)).toBe(-50);
  });

  it("is null when there is no base to compare against", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe("formatPercent", () => {
  it.each([
    [12.44, "+12.4%"],
    [12.45, "+12.5%"],
    [-3, "-3.0%"],
    [0, "0.0%"],
    [100, "+100.0%"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });

  it("shows changes that round to zero without a sign", () => {
    expect(formatPercent(0.04)).toBe("0.0%");
  });
});

describe("formatApy", () => {
  it.each([
    [460, "4.60%"],
    [390, "3.90%"],
    [0, "0.00%"],
    [5, "0.05%"],
  ])("formats %d basis points as %s", (bps, expected) => {
    expect(formatApy(bps)).toBe(expected);
  });
});
