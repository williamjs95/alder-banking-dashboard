import { readFileSync } from "node:fs";
import {
  choose,
  expect,
  expectEveryCell,
  interactive,
  tableRows,
  test,
  visit,
} from "./support/test";

test.beforeEach(async ({ page }) => {
  await visit(page, "/transactions");
  await expect(tableRows(page)).toHaveCount(25);
});

test("search narrows the list and is reflected in the URL", async ({
  page,
}) => {
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("Gusto Payroll");

  await expect(page).toHaveURL(/q=Gusto\+Payroll/);
  await expect(page.getByText("Matching")).toBeVisible();
  const rows = tableRows(page);
  await expect(rows.first()).toContainText("Gusto Payroll");
  await expectEveryCell(page, 2, (text) => text.includes("Gusto Payroll"));
});

test("search also matches an exact amount", async ({ page }) => {
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("8,400.00");
  await expect(tableRows(page).first()).toContainText("WeWork");
  await expectEveryCell(page, "last", (text) => text === "-$8,400.00");
});

test("direction, category and status filters combine", async ({ page }) => {
  await choose(page, "Direction", "Money in");
  await expect(page).toHaveURL(/direction=in/);
  await expectEveryCell(page, "last", (text) => text.startsWith("+"));

  await choose(page, "Direction", "In and out");
  await page.getByRole("button", { name: "Category" }).click();
  await page.getByRole("checkbox", { name: "Payroll" }).click();
  await expect(page.getByRole("checkbox", { name: "Payroll" })).toBeChecked();
  await page.getByRole("checkbox", { name: "Taxes" }).click();
  await expect(page.getByRole("checkbox", { name: "Taxes" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/category=payroll%2Ctaxes/);
  await expect(
    page.getByRole("button", { name: /Category 2 selected/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("checkbox", { name: "Scheduled" }).click();
  await expect(page.getByRole("checkbox", { name: "Scheduled" })).toBeChecked();
  await page.keyboard.press("Escape");

  const rows = tableRows(page);
  await expect(rows.first()).toContainText("Scheduled");
  await expectEveryCell(page, 2, (text) => /Gusto (Payroll|Tax)/.test(text));
});

test("date presets and an amount range filter the list", async ({ page }) => {
  await page.getByRole("button", { name: "Any date" }).click();
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("button", { name: /^Since / })).toBeVisible();

  await page.getByRole("button", { name: "Any amount" }).click();
  await page.getByLabel("Minimum").fill("10000");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/minCents=1000000/);
  await expect(
    page.getByRole("button", { name: "At least $10,000" }),
  ).toBeVisible();

  await expectEveryCell(
    page,
    "last",
    (text) => Number(text.replace(/[^0-9.]/g, "")) >= 10_000,
  );
});

test("clearing filters restores the full list", async ({ page }) => {
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("no such merchant");
  await expect(page.getByText("No transactions match")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).first().click();

  await expect(tableRows(page)).toHaveCount(25);
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("searchbox", { name: "Search transactions" }),
  ).toHaveValue("");
});

test("sorting by amount orders rows and announces the direction", async ({
  page,
}) => {
  const header = page.getByRole("columnheader", { name: "Amount" });
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(page).toHaveURL(/sort=amount&order=desc/);

  const amounts = async () =>
    (await tableRows(page).locator("td:last-child").allInnerTexts()).map(
      (text) => Number(text.replace(/[^0-9.+-]/g, "")),
    );
  const descending = await amounts();
  expect(descending).toEqual([...descending].sort((a, b) => b - a));

  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(async () => {
    const ascending = await amounts();
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(ascending[0]).toBeLessThan(0);
  }).toPass();
});

test("pagination moves between pages and changes the page size", async ({
  page,
}) => {
  const firstReference = await tableRows(page).first().innerText();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(page).toHaveURL(/page=2/);
  await expect(tableRows(page).first()).not.toHaveText(firstReference);

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();

  await choose(page, "Rows per page", "50 per page");
  await expect(tableRows(page)).toHaveCount(50);
});

test("a transaction's note and category can be edited from its detail", async ({
  page,
}) => {
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("Slack");
  const row = tableRows(page).first();
  await expect(row).toContainText("Slack");
  await row.click();

  const sheet = page.getByRole("dialog", { name: "Slack" });
  await expect(sheet.getByText(/^ALD-/)).toBeVisible();
  await expect(sheet.getByText("Software & SaaS")).toBeVisible();

  await sheet.getByLabel("Note").fill("Annual plan renewal");
  await sheet.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Transaction updated")).toBeVisible();

  await sheet.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Marketing" }).click();
  await expect(sheet.getByRole("combobox", { name: "Category" })).toHaveText(
    "Marketing",
  );

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(row.getByLabel("Has a note")).toBeVisible();
  await expect(row).toContainText("Marketing");

  // The change is stored on the server, not just in the page.
  await page.reload();
  await interactive(page);
  await expect(tableRows(page).first().getByLabel("Has a note")).toBeVisible();
});

test("a transaction link restores the open detail, and bad filters are ignored", async ({
  page,
}) => {
  await tableRows(page).nth(3).click();
  await expect(page).toHaveURL(/tx=/);
  const url = page.url();

  await visit(page, `${url}&status=bogus&pageSize=7`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(tableRows(page)).toHaveCount(25);
});

test("Export CSV downloads the filtered transactions", async ({ page }) => {
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("WeWork");
  await expect(tableRows(page).first()).toContainText("WeWork");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /^alder-transactions-\d{4}-\d{2}-\d{2}\.csv$/,
  );

  const lines = readFileSync(await download.path(), "utf8")
    .trim()
    .split("\r\n");
  expect(lines[0]).toBe(
    "Date,Description,Amount,Status,Category,Method,Account,Reference,Note",
  );
  expect(lines.length).toBeGreaterThan(10);
  for (const line of lines.slice(1)) {
    expect(line).toContain("WeWork");
    expect(line).toContain("-8400.00");
  }
});
