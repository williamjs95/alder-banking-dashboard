import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNav } from "./mobile-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));
vi.mock("next/link", () => import("../../../test/ui-next-link"));

beforeEach(() => {
  navigation.pathname = "/";
});

async function openDrawer() {
  const user = userEvent.setup();
  render(<MobileNav />);
  await user.click(screen.getByRole("button", { name: "Open navigation" }));
  return { user, drawer: await screen.findByRole("dialog") };
}

describe("MobileNav", () => {
  it("starts closed, behind a button that says what it opens", () => {
    render(<MobileNav />);

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("opens a drawer named for the product and described as navigation", async () => {
    const { drawer } = await openDrawer();

    expect(drawer).toHaveAccessibleName("Alder");
    expect(drawer).toHaveAccessibleDescription("Main navigation");
  });

  it("lists every page in the drawer", async () => {
    const { drawer } = await openDrawer();

    const nav = within(drawer).getByRole("navigation", { name: "Primary" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Overview",
      "Transactions",
      "Accounts",
      "Payments",
      "Cards",
      "Insights",
    ]);
  });

  it("marks the page being viewed as current", async () => {
    navigation.pathname = "/payments";

    const { drawer } = await openDrawer();

    expect(
      within(drawer).getByRole("link", { name: "Payments" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(drawer).getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("closes after a link is followed, so the new page is not left covered", async () => {
    const { user, drawer } = await openDrawer();

    await user.click(within(drawer).getByRole("link", { name: "Cards" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const { user } = await openDrawer();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from its close button and can be opened again", async () => {
    const { user, drawer } = await openDrawer();

    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
