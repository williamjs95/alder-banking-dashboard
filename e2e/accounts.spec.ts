import { expect, test } from "./support/test";

test("accounts list every account and open into a detail page", async ({
  page,
}) => {
  await page.goto("/accounts");
  await expect(page.getByText(/across 3 accounts/)).toBeVisible();
  await expect(page.getByText("4.60% APY")).toBeVisible();

  await page.getByRole("link", { name: /Treasury/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Treasury" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available balance" }),
  ).toBeVisible();
  await expect(page.getByText("Interest earned").first()).toBeVisible();
});

test("account numbers stay masked until revealed, and can be hidden again", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("link", { name: /Operating Checking/ }).click();

  await expect(page.getByText("••••••••4821")).toBeVisible();
  await expect(page.getByText("202418874821")).toHaveCount(0);

  await page.getByRole("button", { name: "Show numbers" }).click();
  await expect(page.getByText("202418874821")).toBeVisible();
  await expect(page.getByText("114924742")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy account number" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Hide numbers" }).click();
  await expect(page.getByText("202418874821")).toHaveCount(0);
});

test("an account's activity link filters transactions to that account", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("link", { name: /Savings Reserve/ }).click();
  await page.getByRole("radio", { name: "1Y" }).click();
  await expect(page.getByRole("radio", { name: "1Y" })).toBeChecked();

  await page.getByRole("link", { name: "View all" }).click();
  await expect(page).toHaveURL(/\/transactions\?accountId=/);
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveText(
    "Savings Reserve",
  );
  await expect(page.locator("table tbody tr").first()).toContainText(
    "Interest earned",
  );
});
