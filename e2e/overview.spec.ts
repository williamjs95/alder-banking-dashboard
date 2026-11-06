import { balances, card, expect, test, visit } from "./support/test";
import { formatMoney } from "../src/lib/money";

test("the overview leads with the total of all account balances", async ({
  page,
}) => {
  await visit(page, "/");
  const byAccount = await balances(page);
  const total = Object.values(byAccount).reduce((sum, cents) => sum + cents, 0);
  const [dollars, cents] = formatMoney(total).split(".");

  const hero = card(page, "Total balance");
  await expect(hero.getByText(`${dollars}.${cents}`)).toBeVisible();

  for (const [name, balance] of Object.entries(byAccount)) {
    const row = card(page, "Accounts").getByRole("link", {
      name: new RegExp(name),
    });
    await expect(row).toContainText(formatMoney(balance));
  }
});

test("the balance chart changes range and offers the same data as a table", async ({
  page,
}) => {
  await visit(page, "/");
  const panel = card(page, "Total balance");
  await expect(panel.getByText("in the last 90 days")).toBeVisible();

  await panel.getByRole("radio", { name: "30D" }).click();
  await expect(panel.getByText("in the last 30 days")).toBeVisible();
  await expect(panel.getByRole("radio", { name: "30D" })).toBeChecked();

  await panel.getByRole("button", { name: "Show as table" }).click();
  const table = panel.getByRole("table");
  await expect(
    table.getByRole("columnheader", { name: "Balance" }),
  ).toBeVisible();
  // 30 days of history plus the header row.
  await expect(table.getByRole("row")).toHaveCount(31);

  await panel.getByRole("button", { name: "Show chart" }).click();
  await expect(panel.getByRole("table")).toHaveCount(0);
});

test("the cash flow chart shows a value on hover and has a table view", async ({
  page,
}) => {
  await visit(page, "/");
  const panel = card(page, "Cash flow");
  await panel.scrollIntoViewIfNeeded();

  const plot = panel.locator(".recharts-wrapper");
  const box = await plot.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(panel.getByText("Net", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Show as table" }).click();
  await expect(
    panel.getByRole("columnheader", { name: "Money out" }),
  ).toBeVisible();
  await expect(panel.getByRole("row")).toHaveCount(13);
});

test("a spend category drills into matching transactions", async ({ page }) => {
  await visit(page, "/");
  await page.getByRole("link", { name: /^Payroll/ }).click();

  await expect(page).toHaveURL(
    /\/transactions\?category=payroll&direction=out&from=/,
  );
  await expect(page.getByText("Matching")).toBeVisible();
  const descriptions = page.locator("table tbody tr td:nth-child(2)");
  await expect(descriptions.first()).toContainText("Gusto Payroll");
});

test("a recent transaction opens its detail", async ({ page }) => {
  await visit(page, "/");
  const recent = card(page, "Recent transactions");
  const first = recent.getByRole("listitem").first().getByRole("link");
  const name = await first.locator("span.block").first().innerText();
  await first.click();

  await expect(page.getByRole("dialog", { name })).toBeVisible();
});

test("upcoming payments and quick actions lead to the right places", async ({
  page,
}) => {
  await visit(page, "/");
  const upcoming = card(page, "Upcoming payments");
  await expect(upcoming.getByText(/^Due /).first()).toBeVisible();

  await page.getByRole("link", { name: "Transfer", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Transfer between accounts" }),
  ).toBeVisible();
});
