import { card, expect, test } from "./support/test";

test("insights summarize spend and link through to the transactions behind it", async ({
  page,
}) => {
  await page.goto("/insights");
  await expect(page.getByText("Average monthly spend")).toBeVisible();
  await expect(page.getByText("Average monthly revenue")).toBeVisible();

  const trend = page.locator("[data-slot=card]", {
    hasText: "Spend by category",
  });
  await expect(trend.getByText("Payroll")).toBeVisible();
  await expect(trend.getByText("Other")).toBeVisible();
  await trend.getByRole("button", { name: "Show as table" }).click();
  await expect(
    trend.getByRole("columnheader", { name: "Total" }),
  ).toBeVisible();
  // Six months plus the header.
  await expect(trend.getByRole("row")).toHaveCount(7);

  const changes = card(page, "What changed");
  await expect(changes.getByRole("row", { name: /Payroll/ })).toBeVisible();

  await card(page, "Top payees")
    .getByRole("link", { name: /^Gusto Payroll/ })
    .click();
  await expect(page).toHaveURL(
    /\/transactions\?q=Gusto(%20|\+)Payroll&direction=out/,
  );
  await expect(page.locator("table tbody tr").first()).toContainText(
    "Gusto Payroll",
  );
});

test("the largest expense tile opens that transaction", async ({ page }) => {
  await page.goto("/insights");
  const tile = page.locator("[data-slot=card]", { hasText: "Largest expense" });
  await tile.getByRole("link").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/tx=/);
});
