import { balances, card, choose, expect, test, visit } from "./support/test";

const CHECKING = "Operating Checking";
const SAVINGS = "Savings Reserve";

test.beforeEach(async ({ page }) => {
  await visit(page, "/payments");
});

test("sending an ACH payment debits the account and records the transaction", async ({
  page,
}) => {
  const before = await balances(page);

  await page.getByRole("button", { name: /^Send money/ }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, "Recipient", "Pilot.com, Inc.");
  await dialog.getByLabel("Amount").fill("1250");
  await dialog.getByLabel("Memo").fill("October bookkeeping");
  await dialog.getByRole("button", { name: "Review payment" }).click();

  await expect(
    dialog.getByRole("heading", { name: "Review payment" }),
  ).toBeVisible();
  await expect(dialog.getByText("October bookkeeping")).toBeVisible();
  await expect(dialog.getByText("Wire fee")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Send $1,250.00" }).click();

  await expect(dialog.getByRole("status")).toContainText("Payment sent");
  await expect(dialog.getByText(/Reference ALD-/)).toBeVisible();

  const after = await balances(page);
  expect(after[CHECKING]).toBe(before[CHECKING] - 1_250_00);

  await dialog.getByRole("link", { name: "View transaction" }).click();
  const sheet = page.getByRole("dialog", { name: "Pilot.com, Inc." });
  await expect(sheet.getByText("-$1,250.00")).toBeVisible();
  await expect(sheet.getByText("Pending").first()).toBeVisible();
  await expect(sheet.getByLabel("Note")).toHaveValue("October bookkeeping");
});

test("a sent payment posts by itself, without reloading the page", async ({
  page,
}) => {
  // Settlement takes a minute, so this one test is deliberately slow.
  test.setTimeout(120_000);
  const before = await balances(page);

  await page.getByRole("button", { name: /^Send money/ }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, "Recipient", "Pilot.com, Inc.");
  await dialog.getByLabel("Amount").fill("75");
  await dialog.getByRole("button", { name: "Review payment" }).click();
  await dialog.getByRole("button", { name: "Send $75.00" }).click();
  await dialog.getByRole("link", { name: "View transaction" }).click();

  const sheet = page.getByRole("dialog", { name: "Pilot.com, Inc." });
  const current = sheet.locator("[aria-current=step]");
  await expect(current).toHaveText("Processing");

  await expect(current).toHaveCount(0, { timeout: 90_000 });
  await expect(sheet.getByText("Posted").first()).toBeVisible();
  // Posting finishes the payment; the money left when it was sent.
  const after = await balances(page);
  expect(after[CHECKING]).toBe(before[CHECKING] - 75_00);
});

test("a wire adds the fee to the total and to the ledger", async ({ page }) => {
  const before = await balances(page);

  await page.getByRole("button", { name: "Pay Gunderson Dettmer LLP" }).click();
  const dialog = page.getByRole("dialog");
  // The recipient's default method is preselected.
  await expect(dialog.getByRole("radio", { name: /Wire/ })).toBeChecked();
  await dialog.getByLabel("Amount").fill("2,000.00");
  await dialog.getByRole("button", { name: "Review payment" }).click();

  await expect(dialog.getByText("Wire fee")).toBeVisible();
  await dialog.getByRole("button", { name: "Send $2,015.00" }).click();
  await expect(dialog.getByRole("status")).toContainText("Payment sent");

  const after = await balances(page);
  expect(after[CHECKING]).toBe(before[CHECKING] - 2_015_00);

  await dialog.getByRole("button", { name: "Done" }).click();
  await visit(page, "/transactions?q=Outgoing+wire+fee");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr").first()).toContainText("-$15.00");
});

test("a payment larger than the balance is refused before review", async ({
  page,
}) => {
  const before = await balances(page);
  await page.getByRole("button", { name: /^Send money/ }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "Review payment" }).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Choose a recipient" }),
  ).toBeVisible();
  await expect(dialog.getByText("Enter an amount")).toBeVisible();

  await choose(page, "Recipient", "Hartwell Staffing");
  await dialog.getByLabel("Amount").fill("5000000");
  await dialog.getByRole("button", { name: "Review payment" }).click();

  await expect(dialog.getByText(/Exceeds the available balance/)).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Send money" }),
  ).toBeVisible();
  expect(await balances(page)).toEqual(before);
});

test("a payment dated in the future is scheduled and moves no money yet", async ({
  page,
}) => {
  const before = await balances(page);
  const sendOn = new Date(Date.now() + 5 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await page.getByRole("button", { name: /^Send money/ }).click();
  const dialog = page.getByRole("dialog");
  await choose(page, "Recipient", "Oakline Design Studio");
  await dialog.getByLabel("Amount").fill("3200");
  await dialog.getByLabel("Send on").fill(sendOn);
  await dialog.getByRole("button", { name: "Review payment" }).click();
  await dialog.getByRole("button", { name: "Schedule payment" }).click();

  await expect(dialog.getByRole("status")).toContainText("Payment scheduled");
  await dialog.getByRole("button", { name: "Done" }).click();

  expect(await balances(page)).toEqual(before);
  const scheduled = card(page, "Scheduled payments");
  await expect(scheduled.getByText("Oakline Design Studio")).toBeVisible();
  await expect(scheduled.getByText("-$3,200.00")).toBeVisible();
});

test("a transfer moves money between two accounts instantly", async ({
  page,
}) => {
  const before = await balances(page);

  await page
    .getByRole("button", { name: /^Transfer between accounts/ })
    .click();
  const dialog = page.getByRole("dialog");
  await choose(page, "From", new RegExp(CHECKING));
  await choose(page, "To", new RegExp(CHECKING));
  await dialog.getByLabel("Amount").fill("5000");
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByText("Choose two different accounts")).toBeVisible();

  await choose(page, "To", new RegExp(SAVINGS));
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Transfer complete");

  const after = await balances(page);
  expect(after[CHECKING]).toBe(before[CHECKING] - 5_000_00);
  expect(after[SAVINGS]).toBe(before[SAVINGS] + 5_000_00);
});

test("a new recipient is validated, saved and immediately payable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add recipient" }).click();
  const dialog = page.getByRole("dialog", { name: "Add recipient" });

  await dialog.getByRole("button", { name: "Add recipient" }).click();
  await expect(dialog.getByText("Enter the recipient's name")).toBeVisible();
  await expect(dialog.getByText("Routing numbers have 9 digits")).toBeVisible();

  await dialog.getByLabel("Name").fill("Juniper Translation Co.");
  await dialog.getByLabel("Bank").fill("Frost Bank");
  await dialog.getByLabel("Routing number").fill("114000093");
  await dialog.getByLabel("Account number").fill("000123456789");
  await dialog.getByRole("button", { name: "Add recipient" }).click();

  await expect(page.getByText("Juniper Translation Co. added")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Frost Bank ••6789 · ACH")).toBeVisible();

  await page
    .getByRole("button", { name: "Pay Juniper Translation Co." })
    .click();
  await expect(page.getByRole("combobox", { name: "Recipient" })).toHaveText(
    "Juniper Translation Co.",
  );
});

test("replaying a transfer with the same idempotency key does not move money twice", async ({
  page,
}) => {
  const accounts = await (await page.request.get("/api/accounts")).json();
  const [from, to] = accounts;
  const request = {
    headers: { "Idempotency-Key": "e2e-replay-1" },
    data: { fromAccountId: from.id, toAccountId: to.id, amountCents: 100_00 },
  };

  const first = await page.request.post("/api/transfers", request);
  const second = await page.request.post("/api/transfers", request);
  expect(first.status()).toBe(201);
  expect(second.status()).toBe(201);
  expect((await second.json()).debit.id).toBe((await first.json()).debit.id);

  const after = await balances(page);
  expect(after[from.name]).toBe(from.balanceCents - 100_00);

  const overdraw = await page.request.post("/api/transfers", {
    data: {
      fromAccountId: from.id,
      toAccountId: to.id,
      amountCents: 9_000_000_00,
    },
  });
  expect(overdraw.status()).toBe(422);
  expect((await overdraw.json()).error.code).toBe("insufficient_funds");
});
