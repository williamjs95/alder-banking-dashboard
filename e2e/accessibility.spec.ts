import AxeBuilder from "@axe-core/playwright";
import { expect, test, visit } from "./support/test";

const PAGES = [
  "/",
  "/transactions",
  "/accounts",
  "/payments",
  "/cards",
  "/insights",
];

/** Automated WCAG 2.1 A and AA checks. They catch contrast, naming and structure errors. */
async function violations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
}

for (const theme of ["light", "dark"] as const) {
  for (const path of PAGES) {
    test(`${path} has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.addInitScript((value) => {
        localStorage.setItem("alder-theme", value);
      }, theme);
      await visit(page, path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);

      expect(await violations(page)).toEqual([]);
    });
  }
}

test("open dialogs and panels have no accessibility violations", async ({
  page,
}) => {
  await visit(page, "/payments?new=payment");
  await expect(page.getByRole("dialog", { name: "Send money" })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await visit(page, "/transactions");
  await page.locator("table tbody tr").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});
