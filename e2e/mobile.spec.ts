import { expect, test, visit } from "./support/test";

test("on a phone, navigation moves into a drawer and the ledger becomes a list", async ({
  page,
}) => {
  await visit(page, "/");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(drawer).toBeHidden();
  await expect(page.locator("table")).toBeHidden();

  const first = page.locator("main ul li button").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Reference")).toBeVisible();
});

test("on a phone, the overview fits the viewport without sideways scrolling", async ({
  page,
}) => {
  await visit(page, "/");
  await expect(page.getByText("Total balance")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
