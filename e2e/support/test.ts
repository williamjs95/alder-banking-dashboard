import { test as base, expect, type Page } from "@playwright/test";
import { CoverageReport } from "monocart-coverage-reports";
import type { AccountDto } from "../../src/lib/contracts";
import { coverageOptions } from "./coverage-options";

/**
 * The shared test object. In Chromium it records which client-side JavaScript
 * each test executed, so the suite can report coverage of the code in src/.
 */
export const test = base.extend<{ recordCoverage: void }>({
  recordCoverage: [
    async ({ page, browserName }, use) => {
      const enabled =
        browserName === "chromium" && !process.env.E2E_NO_COVERAGE;
      if (enabled) {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
      }
      await use();
      if (enabled) {
        const entries = await page.coverage.stopJSCoverage();
        // Added now, while the server can still serve the source maps.
        await new CoverageReport(coverageOptions).add(entries);
      }
    },
    { auto: true },
  ],
});

export { expect };

/** Current balances by account name, read through the same session as the page. */
export async function balances(page: Page): Promise<Record<string, number>> {
  const response = await page.request.get("/api/accounts");
  expect(response.ok()).toBe(true);
  const accounts = (await response.json()) as AccountDto[];
  return Object.fromEntries(
    accounts.map((account) => [account.name, account.balanceCents]),
  );
}

/** Picks an option from one of the app's select controls. */
export async function choose(
  page: Page,
  label: string,
  option: string | RegExp,
) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

/** The card (panel) whose heading is exactly `heading`. */
export function card(page: Page, heading: string) {
  return page.locator("[data-slot=card]").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
}

/**
 * Asserts that every visible row's cell in `column` (1-based) satisfies
 * `check`. Retries until it holds, since a filter change refetches the list.
 */
export async function expectEveryCell(
  page: Page,
  column: number | "last",
  check: (text: string) => boolean,
) {
  const selector =
    column === "last" ? "td:last-child" : `td:nth-child(${column})`;
  await expect(async () => {
    const texts = await tableRows(page).locator(selector).allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => !check(text))).toEqual([]);
  }).toPass({ timeout: 10_000 });
}

/** The rows of the transactions table, excluding the header. */
export function tableRows(page: Page) {
  return page.locator("table tbody tr");
}
