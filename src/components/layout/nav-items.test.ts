import { describe, expect, it } from "vitest";
import { isActive, NAV_ITEMS } from "./nav-items";

describe("NAV_ITEMS", () => {
  it("lists the app's pages in sidebar order", () => {
    expect(NAV_ITEMS.map(({ href, label }) => [href, label])).toEqual([
      ["/", "Overview"],
      ["/transactions", "Transactions"],
      ["/accounts", "Accounts"],
      ["/payments", "Payments"],
      ["/cards", "Cards"],
      ["/insights", "Insights"],
    ]);
  });

  it("gives every page its own icon", () => {
    const icons = NAV_ITEMS.map((item) => item.icon);

    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(NAV_ITEMS.length);
  });
});

describe("isActive", () => {
  it("matches a page's own path", () => {
    expect(isActive("/transactions", "/transactions")).toBe(true);
  });

  it("matches pages nested under it", () => {
    expect(isActive("/accounts", "/accounts/1111")).toBe(true);
    expect(isActive("/accounts", "/accounts/1111/statements")).toBe(true);
  });

  it("does not match a sibling page that merely shares a prefix", () => {
    expect(isActive("/cards", "/cardsharks")).toBe(false);
    expect(isActive("/accounts", "/accounting")).toBe(false);
  });

  it("does not match other pages", () => {
    expect(isActive("/transactions", "/payments")).toBe(false);
    expect(isActive("/transactions", "/")).toBe(false);
  });

  it("matches the overview only at the root, not on every page", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/transactions")).toBe(false);
    expect(isActive("/", "/accounts/1111")).toBe(false);
  });
});
