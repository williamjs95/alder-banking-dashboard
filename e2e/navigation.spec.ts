import { expect, interactive, test, visit } from "./support/test";

const PAGES = [
  { link: "Transactions", path: "/transactions", heading: "Transactions" },
  { link: "Accounts", path: "/accounts", heading: "Accounts" },
  { link: "Payments", path: "/payments", heading: "Payments" },
  { link: "Cards", path: "/cards", heading: "Cards" },
  { link: "Insights", path: "/insights", heading: "Insights" },
  { link: "Overview", path: "/", heading: "Overview" },
];

test("the sidebar reaches every page and marks the current one", async ({
  page,
}) => {
  await visit(page, "/");
  const nav = page.getByRole("navigation", { name: "Primary" });

  for (const { link, path, heading } of PAGES) {
    await nav.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: link })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("the command palette jumps to a page from the keyboard", async ({
  page,
}) => {
  await visit(page, "/");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();

  await palette.getByRole("combobox").fill("insi");
  await expect(palette.getByRole("option", { name: "Insights" })).toBeVisible();
  await expect(palette.getByRole("option", { name: "Cards" })).toHaveCount(0);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/insights$/);
  await expect(palette).toBeHidden();
});

test("the command palette finds a transaction and opens its detail", async ({
  page,
}) => {
  await visit(page, "/");
  await page.getByRole("button", { name: /Search or jump to/ }).click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await palette.getByRole("combobox").fill("WeWork");

  await palette
    .getByRole("option", { name: /WeWork/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/transactions\?tx=/);
  const sheet = page.getByRole("dialog", { name: /WeWork/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("$8,400.00")).toBeVisible();
});

test("the theme toggle switches to dark and the choice survives a reload", async ({
  page,
}) => {
  await visit(page, "/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await interactive(page);
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
});

test("an unknown account shows the not-found page with a way back", async ({
  page,
}) => {
  await visit(page, "/accounts/6f1c2a3b-4d5e-4f60-8a71-9b8c7d6e5f40");
  await expect(page.getByText("Page not found")).toBeVisible();

  await page.getByRole("link", { name: "Back to overview" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
});

test("the top bar's Send money button opens the payment dialog from any page", async ({
  page,
}) => {
  await visit(page, "/insights");
  await page.getByRole("link", { name: "Send money" }).click();
  await expect(page.getByRole("dialog", { name: "Send money" })).toBeVisible();
});
