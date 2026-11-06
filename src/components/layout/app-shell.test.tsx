import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { AppShell } from "./app-shell";

const navigation = vi.hoisted(() => ({
  router: { push: vi.fn(), refresh: vi.fn() },
  // A string, or a promise to make the pathname suspend as it does during
  // the static pre-render.
  pathname: "/" as string | Promise<string>,
}));

vi.mock("next/navigation", async () => {
  const { use } = await import("react");
  return {
    useRouter: () => navigation.router,
    usePathname: () =>
      typeof navigation.pathname === "string"
        ? navigation.pathname
        : use(navigation.pathname),
  };
});

beforeEach(() => {
  navigation.pathname = "/";
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

function setup() {
  const user = userEvent.setup();
  renderWithProviders(
    <AppShell>
      <h1>Overview</h1>
    </AppShell>,
  );
  return { user };
}

const currentPage = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("AppShell", () => {
  it("renders the page inside the main landmark", () => {
    setup();

    expect(
      within(screen.getByRole("main")).getByRole("heading", {
        name: "Overview",
      }),
    ).toBeInTheDocument();
  });

  it("offers a skip link, first in the tab order, that targets the main landmark", async () => {
    const { user } = setup();
    const skip = screen.getByRole("link", { name: "Skip to content" });

    await user.tab();

    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("has a sidebar with the logo linking home, the navigation and the account menu", () => {
    setup();

    const sidebar = screen.getByRole("complementary");
    expect(
      within(sidebar).getByRole("link", { name: "Alder" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(sidebar).getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: /Maya Chen/ }),
    ).toBeInTheDocument();
  });

  it("marks the current page in the sidebar", () => {
    navigation.pathname = "/cards";

    setup();

    expect(
      currentPage(screen.getByRole("navigation", { name: "Primary" })),
    ).toEqual(["Cards"]);
  });

  it("has a top bar with the drawer button, home link, search, theme switch and primary action", () => {
    setup();

    const topBar = within(screen.getByRole("banner"));
    expect(
      topBar.getByRole("button", { name: "Open navigation" }),
    ).toBeInTheDocument();
    expect(topBar.getByRole("link", { name: "Alder home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      topBar.getByRole("button", { name: /Search or jump to/ }),
    ).toBeInTheDocument();
    expect(
      topBar.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
    expect(topBar.getByRole("link", { name: /Send money/ })).toHaveAttribute(
      "href",
      "/payments?new=payment",
    );
  });

  it("opens the command palette with ⌘K from anywhere in the shell", async () => {
    const { user } = setup();

    await user.keyboard("{Meta>}k{/Meta}");

    expect(
      await screen.findByRole("dialog", { name: "Search" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("opens the navigation drawer from the top bar", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = await screen.findByRole("dialog", { name: "Alder" });
    expect(
      within(drawer).getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
  });

  it("switches the theme from the top bar", async () => {
    const { user } = setup();

    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });

  it("shows the navigation with no page marked until the pathname is known, then marks it", async () => {
    let resolvePathname!: (pathname: string) => void;
    navigation.pathname = new Promise<string>((resolve) => {
      resolvePathname = resolve;
    });

    setup();

    // The rest of the shell is already there around the pending navigation.
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
    expect(currentPage(nav)).toEqual([]);
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Search or jump to/ }),
    ).toBeInTheDocument();

    await act(async () => resolvePathname("/insights"));

    await vi.waitFor(() =>
      expect(
        currentPage(screen.getByRole("navigation", { name: "Primary" })),
      ).toEqual(["Insights"]),
    );
  });
});
