import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  CARD_STATUSES,
  CARD_TYPES,
  CATEGORIES,
  CATEGORY_LABELS,
  METHOD_LABELS,
  PAYMENT_METHODS,
  SETTLED_STATUSES,
  STATUS_LABELS,
  TRANSACTION_METHODS,
  TRANSACTION_STATUSES,
  WIRE_FEE_CENTS,
  WORKSPACE_COOKIE,
} from "./domain";

describe("domain vocabulary", () => {
  it.each([
    ["category", CATEGORIES, CATEGORY_LABELS],
    ["transaction method", TRANSACTION_METHODS, METHOD_LABELS],
    ["transaction status", TRANSACTION_STATUSES, STATUS_LABELS],
    ["account type", ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS],
  ] as const)("labels every %s, and nothing else", (_name, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const label of Object.values(labels)) {
      expect(label.trim()).not.toBe("");
    }
  });

  it("has no duplicate values in any vocabulary", () => {
    for (const values of [
      CATEGORIES,
      TRANSACTION_METHODS,
      TRANSACTION_STATUSES,
      ACCOUNT_TYPES,
      CARD_TYPES,
      CARD_STATUSES,
    ]) {
      expect(new Set<string>(values).size).toBe(values.length);
    }
  });

  it("counts only posted and pending transactions toward a balance", () => {
    expect(SETTLED_STATUSES).toEqual(["posted", "pending"]);
    expect(TRANSACTION_STATUSES).toEqual(
      expect.arrayContaining([...SETTLED_STATUSES]),
    );
  });

  it("lets people pay by ACH or wire, both of which are transaction methods", () => {
    expect(PAYMENT_METHODS).toEqual(["ach", "wire"]);
    expect(TRANSACTION_METHODS).toEqual(
      expect.arrayContaining([...PAYMENT_METHODS]),
    );
  });

  it("spells out the labels that differ from their keys", () => {
    expect(CATEGORY_LABELS.rent).toBe("Rent & office");
    expect(CATEGORY_LABELS.transfer).toBe("Internal transfer");
    expect(METHOD_LABELS.ach).toBe("ACH");
    expect(STATUS_LABELS.scheduled).toBe("Scheduled");
    expect(ACCOUNT_TYPE_LABELS.treasury).toBe("Treasury");
  });

  it("charges a flat $15 wire fee, in cents", () => {
    expect(WIRE_FEE_CENTS).toBe(15_00);
  });

  it("names the workspace cookie", () => {
    expect(WORKSPACE_COOKIE).toBe("alder_workspace");
  });
});
