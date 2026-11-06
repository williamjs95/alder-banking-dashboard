import {
  balances,
  card,
  choose,
  expect,
  tableRows,
  test,
} from "./support/test";

/**
 * What the app does when the server says no or cannot be reached. These use
 * request interception, so the failure is exact and the real data is untouched.
 */

const apiError = (
  status: number,
  code: string,
  message: string,
  fields?: object,
) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ error: { code, message, fields } }),
});

async function reviewPayment(page: import("@playwright/test").Page) {
  await page.goto("/payments?new=payment");
  const dialog = page.getByRole("dialog");
  await choose(page, "Recipient", "Pilot.com, Inc.");
  await dialog.getByLabel("Amount").fill("900");
  await dialog.getByRole("button", { name: "Review payment" }).click();
  return dialog;
}

test("a payment the server rejects returns to the form with the reason on the field", async ({
  page,
}) => {
  const before = await balances(page);
  await page.route("**/api/payments", (route) =>
    route.fulfill(
      apiError(422, "insufficient_funds", "Not enough funds.", {
        amountCents: "Amount exceeds the available balance",
      }),
    ),
  );
  const dialog = await reviewPayment(page);
  await dialog.getByRole("button", { name: "Send $900.00" }).click();

  await expect(
    dialog.getByRole("heading", { name: "Send money" }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Amount exceeds the available balance",
  );
  expect(await balances(page)).toEqual(before);
});

test("a server failure on send keeps the review open and can be retried", async ({
  page,
}) => {
  let attempts = 0;
  const keys = new Set<string>();
  await page.route("**/api/payments", async (route) => {
    attempts += 1;
    keys.add(route.request().headers()["idempotency-key"]);
    if (attempts === 1) {
      await route.fulfill(
        apiError(500, "internal_error", "Something went wrong on our side."),
      );
    } else {
      await route.continue();
    }
  });
  const dialog = await reviewPayment(page);
  await dialog.getByRole("button", { name: "Send $900.00" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Something went wrong on our side.",
  );

  await dialog.getByRole("button", { name: "Send $900.00" }).click();
  await expect(dialog.getByRole("status")).toContainText("Payment sent");
  // The retry reused the first attempt's key, so it could not pay twice.
  expect(attempts).toBe(2);
  expect(keys.size).toBe(1);
});

test("going back from review keeps what was entered", async ({ page }) => {
  const dialog = await reviewPayment(page);
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByLabel("Amount")).toHaveValue("900.00");
  await dialog.getByRole("radio", { name: /Wire/ }).click();
  await expect(
    dialog.getByText("Arrives the same business day."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/payments$/);
});

test("a transfer that cannot reach the server says so and moves nothing", async ({
  page,
}) => {
  await page.goto("/payments?new=transfer");
  const before = await balances(page);
  await page.route("**/api/transfers", (route) => route.abort());
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Amount").fill("9999999");
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByText(/Exceeds the available balance/)).toBeVisible();

  await dialog.getByLabel("Amount").fill("100");
  await dialog.getByLabel("Memo").fill("Top up");
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not reach the server",
  );
  expect(await balances(page)).toEqual(before);
});

test("a recipient the server rejects shows the message and stays open", async ({
  page,
}) => {
  await page.goto("/payments?new=recipient");
  await page.route("**/api/recipients", (route) =>
    route.request().method() === "POST"
      ? route.fulfill(
          apiError(422, "validation_error", "Some fields need attention.", {
            routingNumber: "This routing number is not recognized",
          }),
        )
      : route.continue(),
  );
  const dialog = page.getByRole("dialog", { name: "Add recipient" });
  await dialog.getByLabel("Name").fill("Northwind Traders");
  await dialog.getByLabel("Email").fill("ap@northwind.example");
  await dialog.getByLabel("Bank").fill("Frost Bank");
  await dialog.getByLabel("Routing number").fill("114000093");
  await dialog.getByLabel("Account number").fill("12345678");
  await dialog.getByRole("radio", { name: "Wire" }).click();
  await dialog.getByRole("button", { name: "Add recipient" }).click();

  await expect(
    dialog.getByText("This routing number is not recognized"),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("a failed freeze puts the switch back and explains", async ({ page }) => {
  await page.goto("/cards");
  await page.route("**/api/cards/*", (route) =>
    route.fulfill(
      apiError(500, "internal_error", "Could not update the card."),
    ),
  );
  const office = page
    .locator("main")
    .getByRole("listitem")
    .filter({ hasText: "Office" });
  const toggle = office.getByRole("switch", { name: "Freeze card" });
  await toggle.click();

  await expect(page.getByText("Could not update the card.")).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await office.getByRole("button", { name: "Edit limit" }).click();
  const dialog = page.getByRole("dialog", { name: "Change monthly limit" });
  await dialog.getByLabel("Monthly limit").fill("");
  await dialog.getByRole("button", { name: "Save limit" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a limit");
  await dialog.getByLabel("Monthly limit").fill("4000");
  await dialog.getByRole("button", { name: "Save limit" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Could not update the card.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("a card close to or past its limit is flagged in words, not just color", async ({
  page,
}) => {
  await page.goto("/cards");
  const cloud = page
    .locator("main")
    .getByRole("listitem")
    .filter({ hasText: "Cloud infrastructure" });
  const cards = await (await page.request.get("/api/cards")).json();
  const spent = Math.round(
    cards.find(
      (item: { label: string }) => item.label === "Cloud infrastructure",
    ).spentThisMonthCents / 100,
  );
  test.skip(spent < 200, "No cloud spend yet this month to measure against");

  const setLimit = async (dollars: number) => {
    await cloud.getByRole("button", { name: "Edit limit" }).click();
    const dialog = page.getByRole("dialog", { name: "Change monthly limit" });
    await dialog.getByLabel("Monthly limit").fill(String(dollars));
    await dialog.getByRole("button", { name: "Save limit" }).click();
    await expect(dialog).toBeHidden();
  };

  await setLimit(Math.ceil(spent * 1.1));
  await expect(cloud.getByText("Near limit")).toBeVisible();

  await setLimit(Math.max(100, spent - 50));
  await expect(cloud.getByText("Limit reached")).toBeVisible();
  await expect(cloud.getByRole("meter")).toBeVisible();
});

test("the transaction list recovers from a failed load", async ({ page }) => {
  await page.goto("/transactions");
  await expect(tableRows(page)).toHaveCount(25);

  let fail = true;
  await page.route("**/api/transactions?*", (route) =>
    fail
      ? route.fulfill(
          apiError(500, "internal_error", "Something went wrong on our side."),
        )
      : route.continue(),
  );
  await page
    .getByRole("searchbox", { name: "Search transactions" })
    .fill("Stripe");
  await expect(page.getByText("Transactions could not load")).toBeVisible();

  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(tableRows(page).first()).toContainText("Stripe");
});

test("every kind of transaction explains itself in the detail panel", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/transactions?status=failed");
  await tableRows(page).first().click();
  let sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Returned", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Note")).toHaveValue(
    /Returned by receiving bank/,
  );

  await sheet.getByRole("button", { name: "Copy reference" }).click();
  await expect(
    sheet.getByRole("button", { name: "reference copied" }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^ALD-[A-Z0-9]{8}$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.goto("/transactions?status=scheduled&order=asc");
  await tableRows(page).first().click();
  sheet = page.getByRole("dialog");
  await expect(sheet.locator("[aria-current=step]")).toHaveText("Scheduled");
  await page.keyboard.press("Escape");

  await page.goto("/transactions?category=transfer&direction=out");
  await tableRows(page).first().click();
  sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Internal transfer")).toBeVisible();
  // System categories are not editable.
  await expect(sheet.getByRole("combobox", { name: "Category" })).toHaveCount(
    0,
  );
  await expect(sheet.getByText("To", { exact: true })).toBeVisible();

  await page.goto("/transactions?category=cloud");
  await tableRows(page).first().click();
  sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Cloud infrastructure ••4417/)).toBeVisible();

  await page.route("**/api/transactions/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill(
          apiError(500, "internal_error", "Could not save the note."),
        )
      : route.continue(),
  );
  await sheet.getByLabel("Note").fill("Check this invoice");
  await sheet.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Could not save the note.")).toBeVisible();
});

test("a custom date range and an amount range can be set and cleared", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Any date" }).click();
  await page.getByRole("button", { name: "Last month" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/);

  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByLabel("To", { exact: true }).fill("2020-01-31");
  await expect(page.getByText("No transactions match")).toBeVisible();
  await page.getByRole("button", { name: "Clear dates" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Any date" })).toBeVisible();
  await expect(tableRows(page)).toHaveCount(25);

  await page.getByRole("button", { name: "Any amount" }).click();
  await page.getByLabel("Minimum").fill("500");
  await page.getByLabel("Maximum").fill("100");
  await expect(
    page.getByText("The maximum must be at least the minimum."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
  await page.getByLabel("Maximum").fill("1000");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("button", { name: "$500 – $1,000" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "$500 – $1,000" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: "Any amount" })).toBeVisible();

  await page.getByRole("button", { name: "Category" }).click();
  await page.getByRole("checkbox", { name: "Software" }).click();
  await expect(page.getByRole("checkbox", { name: "Software" })).toBeChecked();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Software" }),
  ).not.toBeChecked();
});

test("an account page survives its activity list failing to load", async ({
  page,
}) => {
  await page.route("**/api/transactions?*", (route) =>
    route.fulfill(
      apiError(500, "internal_error", "Something went wrong on our side."),
    ),
  );
  await page.goto("/accounts");
  await page.getByRole("link", { name: /Treasury/ }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Treasury" }),
  ).toBeVisible();
  await expect(page.getByText("Activity could not load")).toBeVisible();
  await expect(
    card(page, "Available balance").locator(".recharts-wrapper"),
  ).toBeVisible();

  await page.route("**/api/accounts/*/numbers", (route) =>
    route.fulfill(
      apiError(500, "internal_error", "Numbers are unavailable right now."),
    ),
  );
  await page.getByRole("button", { name: "Show numbers" }).click();
  await expect(
    page.getByText("Numbers are unavailable right now."),
  ).toBeVisible();
});
