import { balances, expect, test, visit } from "./support/test";

test("each visitor gets a private workspace", async ({ page, browser }) => {
  await visit(page, "/");
  const mine = await balances(page);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  const accounts = await (await otherPage.request.get("/api/accounts")).json();
  await otherPage.request.post("/api/transfers", {
    data: {
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      amountCents: 777_00,
    },
  });
  await other.close();

  // Someone else's transfer changes nothing here.
  expect(await balances(page)).toEqual(mine);
  // And their account ids are not readable from this session.
  const foreign = await page.request.get(`/api/accounts/${accounts[0].id}`);
  expect(foreign.status()).toBe(404);
});

test("resetting the demo discards changes and restores the starting state", async ({
  page,
}) => {
  await visit(page, "/");
  const start = await balances(page);
  const accounts = await (await page.request.get("/api/accounts")).json();
  await page.request.post("/api/transfers", {
    data: {
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      amountCents: 25_000_00,
    },
  });
  expect(await balances(page)).not.toEqual(start);

  await page.getByRole("button", { name: /Maya Chen/ }).click();
  await page.getByRole("menuitem", { name: "Reset demo data" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset demo data?" });
  await dialog.getByRole("button", { name: "Reset data" }).click();

  await expect(page.getByText("Demo data reset")).toBeVisible();
  expect(await balances(page)).toEqual(start);
});

test("the API rejects malformed input with field-level errors", async ({
  page,
}) => {
  await visit(page, "/");
  const response = await page.request.post("/api/payments", {
    data: { amountCents: -5, method: "carrier-pigeon" },
  });
  expect(response.status()).toBe(422);
  const { error } = await response.json();
  expect(error.code).toBe("validation_error");
  expect(Object.keys(error.fields)).toEqual(
    expect.arrayContaining([
      "fromAccountId",
      "recipientId",
      "amountCents",
      "method",
    ]),
  );

  const notJson = await page.request.post("/api/transfers", {
    headers: { "Content-Type": "application/json" },
    data: Buffer.from("{not json"),
  });
  expect(notJson.status()).toBe(400);
});
