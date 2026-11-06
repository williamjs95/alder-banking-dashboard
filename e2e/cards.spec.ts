import { expect, interactive, test, visit } from "./support/test";

test.beforeEach(async ({ page }) => {
  await visit(page, "/cards");
});

const panel = (page: import("@playwright/test").Page, label: string) =>
  page.locator("main").getByRole("listitem").filter({ hasText: label });

test("freezing a card takes effect immediately and persists", async ({
  page,
}) => {
  const marketing = panel(page, "Marketing");
  const toggle = marketing.getByRole("switch", { name: "Freeze card" });
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(marketing.getByText("Frozen", { exact: true })).toBeVisible();
  await expect(page.getByText("Marketing frozen")).toBeVisible();

  await page.reload();
  await interactive(page);
  await expect(
    panel(page, "Marketing").getByRole("switch", { name: "Freeze card" }),
  ).toBeChecked();

  await panel(page, "Marketing").getByRole("switch").click();
  await expect(page.getByText("Marketing is active again")).toBeVisible();
});

test("a card's monthly limit can be changed, within bounds", async ({
  page,
}) => {
  const travel = panel(page, "Travel & meals");
  await expect(travel.getByText("of $8,000")).toBeVisible();
  await travel.getByRole("button", { name: "Edit limit" }).click();

  const dialog = page.getByRole("dialog", { name: "Change monthly limit" });
  await dialog.getByLabel("Monthly limit").fill("50");
  await dialog.getByRole("button", { name: "Save limit" }).click();
  await expect(dialog.getByText("The minimum limit is $100")).toBeVisible();

  await dialog.getByLabel("Monthly limit").fill("12,500");
  await dialog.getByRole("button", { name: "Save limit" }).click();

  await expect(page.getByText("Monthly limit updated")).toBeVisible();
  await expect(travel.getByText("of $12,500")).toBeVisible();
});

test("a virtual card can be issued and shows up ready to use", async ({
  page,
}) => {
  await expect(page.getByText(/5 active of 6 cards/)).toBeVisible();
  await page.getByRole("button", { name: "Issue virtual card" }).click();

  const dialog = page.getByRole("dialog", { name: "Issue a virtual card" });
  await dialog.getByRole("button", { name: "Issue card" }).click();
  await expect(dialog.getByText("Give the card a name")).toBeVisible();

  await dialog.getByLabel("Card name").fill("Conference travel");
  await dialog.getByLabel("Monthly limit").fill("2500");
  await dialog.getByRole("button", { name: "Issue card" }).click();

  await expect(page.getByText("Conference travel card issued")).toBeVisible();
  const issued = panel(page, "Conference travel");
  await expect(issued.getByText("of $2,500")).toBeVisible();
  await expect(issued.getByText("Maya Chen")).toBeVisible();
  await expect(page.getByText(/6 active of 7 cards/)).toBeVisible();
});

test("a card's activity link lists only that card's transactions", async ({
  page,
}) => {
  await panel(page, "Cloud infrastructure")
    .getByRole("link", { name: "Activity" })
    .click();

  await expect(page).toHaveURL(/\/transactions\?cardId=/);
  await expect(page.getByText("Matching")).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  const descriptions = await page
    .locator("table tbody tr td:nth-child(2)")
    .allInnerTexts();
  expect(descriptions.length).toBeGreaterThan(5);
  for (const text of descriptions) {
    expect(text).toMatch(/Amazon Web Services|Vercel|Datadog|Cloudflare/);
  }
});
