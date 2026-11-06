import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavLinks, SidebarNav } from "./sidebar-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));
vi.mock("next/link", () => import("../../../test/ui-next-link"));

beforeEach(() => {
  navigation.pathname = "/";
});

const currentPage = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("NavLinks", () => {
  it("is the primary navigation, linking to every page in order", () => {
    render(<NavLinks pathname="/" />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Overview", "/"],
      ["Transactions", "/transactions"],
      ["Accounts", "/accounts"],
      ["Payments", "/payments"],
      ["Cards", "/cards"],
      ["Insights", "/insights"],
    ]);
  });

  it("marks the page being viewed as current, and only that one", () => {
    render(<NavLinks pathname="/transactions" />);

    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(currentPage()).toEqual(["Transactions"]);
  });

  it("keeps a section current on the pages nested under it", () => {
    render(<NavLinks pathname="/accounts/1111" />);

    expect(currentPage()).toEqual(["Accounts"]);
  });

  it("marks the overview current only at the root", () => {
    render(<NavLinks pathname="/" />);

    expect(currentPage()).toEqual(["Overview"]);
  });

  it("marks nothing current on a page outside the navigation", () => {
    render(<NavLinks pathname="/settings" />);

    expect(currentPage()).toEqual([]);
  });

  it("marks nothing current while the pathname is not known yet", () => {
    render(<NavLinks pathname={null} />);

    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(currentPage()).toEqual([]);
  });

  it("styles the current page differently from the rest", () => {
    render(<NavLinks pathname="/cards" />);

    expect(screen.getByRole("link", { name: "Cards" })).toHaveClass(
      "bg-sidebar-accent",
    );
    expect(screen.getByRole("link", { name: "Insights" })).not.toHaveClass(
      "bg-sidebar-accent",
    );
  });

  it("hides the icons from assistive tech, so links are named by their label alone", () => {
    render(<NavLinks pathname="/" />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("tells its owner when a link is followed", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NavLinks pathname="/" onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Payments" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("SidebarNav", () => {
  it("marks the page from the current URL", () => {
    navigation.pathname = "/insights";

    render(<SidebarNav />);

    expect(currentPage()).toEqual(["Insights"]);
  });

  it("follows the URL as it changes", () => {
    navigation.pathname = "/cards";
    const { rerender } = render(<SidebarNav />);
    expect(currentPage()).toEqual(["Cards"]);

    navigation.pathname = "/payments";
    rerender(<SidebarNav />);

    expect(currentPage()).toEqual(["Payments"]);
  });

  it("passes link clicks on to its owner", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<SidebarNav onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Accounts" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
