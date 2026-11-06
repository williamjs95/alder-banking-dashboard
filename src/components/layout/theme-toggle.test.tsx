import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { THEME_STORAGE_KEY } from "./theme-script";
import { ThemeToggle } from "./theme-toggle";

const html = document.documentElement;

beforeEach(() => {
  html.removeAttribute("data-theme");
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("offers the dark theme while the page is light", () => {
    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
  });

  it("offers the light theme while the page is dark", () => {
    html.setAttribute("data-theme", "dark");

    renderWithProviders(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });

  it("switches the page to dark, remembers it, and then offers light", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );

    expect(html).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });

  it("switches back to light on a second click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));

    expect(html).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
  });

  it("swaps its icon with the theme", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);
    const icon = () => screen.getByRole("button").querySelector("svg");

    expect(icon()).toHaveClass("lucide-moon");
    await user.click(screen.getByRole("button"));

    expect(icon()).toHaveClass("lucide-sun");
  });

  it("explains itself in a tooltip on keyboard focus", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.tab();

    expect(screen.getByRole("button")).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Switch to dark theme",
    );
  });

  it("can be toggled from the keyboard", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.tab();
    await user.keyboard("{Enter}");

    expect(html).toHaveAttribute("data-theme", "dark");
  });

  it("stays in sync with another toggle on the page", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );

    await user.click(screen.getAllByRole("button")[0]);

    expect(
      screen.getAllByRole("button", { name: "Switch to light theme" }),
    ).toHaveLength(2);
  });
});
