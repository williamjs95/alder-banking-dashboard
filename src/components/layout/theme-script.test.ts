import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme-script";

const html = document.documentElement;

/** Runs the script the way the browser does from an inline <script> tag. */
const runScript = () => new Function(THEME_SCRIPT)();

/** Sets the operating system's color scheme preference. */
function preferColorScheme(scheme: "dark" | "light") {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === `(prefers-color-scheme: ${scheme})`,
        media: query,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  html.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("THEME_STORAGE_KEY", () => {
  it("is the key the script reads", () => {
    expect(THEME_STORAGE_KEY).toBe("alder-theme");
    expect(THEME_SCRIPT).toContain('localStorage.getItem("alder-theme")');
  });
});

describe("THEME_SCRIPT", () => {
  it("applies a saved dark choice without consulting the operating system", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const matchMedia = preferColorScheme("light");

    runScript();

    expect(html).toHaveAttribute("data-theme", "dark");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("applies a saved light choice even when the operating system prefers dark", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    preferColorScheme("dark");

    runScript();

    expect(html).toHaveAttribute("data-theme", "light");
  });

  it("follows an operating system that prefers dark when nothing is saved", () => {
    const matchMedia = preferColorScheme("dark");

    runScript();

    expect(html).toHaveAttribute("data-theme", "dark");
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
  });

  it("is light when nothing is saved and the operating system does not prefer dark", () => {
    preferColorScheme("light");

    runScript();

    expect(html).toHaveAttribute("data-theme", "light");
  });

  it("treats any saved value other than dark as light", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    preferColorScheme("dark");

    runScript();

    expect(html).toHaveAttribute("data-theme", "light");
  });

  it("replaces a theme already on the document", () => {
    html.setAttribute("data-theme", "light");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runScript();

    expect(html).toHaveAttribute("data-theme", "dark");
  });

  it("fails silently when the browser refuses storage, leaving the document as it was", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    preferColorScheme("dark");

    expect(runScript).not.toThrow();

    expect(html).not.toHaveAttribute("data-theme");
  });

  it("leaves nothing behind in the global scope", () => {
    const before = Object.keys(globalThis).length;

    runScript();

    expect(Object.keys(globalThis)).toHaveLength(before);
  });
});
