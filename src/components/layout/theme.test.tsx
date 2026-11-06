import { act, render, renderHook, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTheme, useTheme } from "./theme";
import { THEME_STORAGE_KEY } from "./theme-script";

const html = document.documentElement;

beforeEach(() => {
  html.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const refuseStorage = () => {
  const refusal = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(refusal);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(refusal);
};

function ThemeProbe({ name = "theme" }: { name?: string }) {
  return <output aria-label={name}>{useTheme()}</output>;
}

describe("setTheme", () => {
  it("applies the theme to the document and remembers it", () => {
    setTheme("dark");

    expect(html).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    setTheme("light");

    expect(html).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("still applies the theme when the browser refuses storage", () => {
    refuseStorage();

    expect(() => setTheme("dark")).not.toThrow();

    expect(html).toHaveAttribute("data-theme", "dark");
  });
});

describe("useTheme", () => {
  it("is light when the document says nothing", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toBe("light");
  });

  it("reads the theme the inline script put on the document", () => {
    html.setAttribute("data-theme", "dark");

    const { result } = renderHook(() => useTheme());

    expect(result.current).toBe("dark");
  });

  it("treats an unknown value as light", () => {
    html.setAttribute("data-theme", "sepia");

    const { result } = renderHook(() => useTheme());

    expect(result.current).toBe("light");
  });

  it("updates every component using it when the theme is set", () => {
    render(
      <>
        <ThemeProbe name="first" />
        <ThemeProbe name="second" />
      </>,
    );
    expect(screen.getByLabelText("first")).toHaveTextContent("light");

    act(() => setTheme("dark"));

    expect(screen.getByLabelText("first")).toHaveTextContent("dark");
    expect(screen.getByLabelText("second")).toHaveTextContent("dark");
  });

  it("keeps updating other components after one unmounts", () => {
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    first.unmount();
    act(() => setTheme("dark"));

    expect(second.result.current).toBe("dark");
    expect(first.result.current).toBe("light");
  });

  it("still updates components when the browser refuses storage", () => {
    refuseStorage();
    const { result } = renderHook(() => useTheme());

    act(() => setTheme("dark"));

    expect(result.current).toBe("dark");
  });

  describe("on mount", () => {
    it("re-applies a saved choice the document has lost", () => {
      // React's dev-only remount can reset <html> attributes it does not own.
      localStorage.setItem(THEME_STORAGE_KEY, "dark");

      const { result } = renderHook(() => useTheme());

      expect(html).toHaveAttribute("data-theme", "dark");
      expect(result.current).toBe("dark");
    });

    it("re-applies a saved light choice over a dark document", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      html.setAttribute("data-theme", "dark");

      const { result } = renderHook(() => useTheme());

      expect(html).toHaveAttribute("data-theme", "light");
      expect(result.current).toBe("light");
    });

    it("changes nothing when the document already matches the saved choice", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      html.setAttribute("data-theme", "dark");
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      const { result } = renderHook(() => useTheme());

      expect(result.current).toBe("dark");
      expect(setItem).not.toHaveBeenCalled();
    });

    it("leaves the operating system's theme alone when nothing is saved", () => {
      html.setAttribute("data-theme", "dark");
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      const { result } = renderHook(() => useTheme());

      expect(result.current).toBe("dark");
      expect(html).toHaveAttribute("data-theme", "dark");
      expect(setItem).not.toHaveBeenCalled();
    });

    it("ignores a saved value that is not a theme", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "sepia");
      html.setAttribute("data-theme", "dark");

      const { result } = renderHook(() => useTheme());

      expect(result.current).toBe("dark");
      expect(html).toHaveAttribute("data-theme", "dark");
    });

    it("keeps the document's theme when the browser refuses storage", () => {
      html.setAttribute("data-theme", "dark");
      refuseStorage();

      const { result } = renderHook(() => useTheme());

      expect(result.current).toBe("dark");
      expect(html).toHaveAttribute("data-theme", "dark");
    });
  });

  describe("server rendering", () => {
    it("renders light on the server, which cannot know the reader's theme", () => {
      html.setAttribute("data-theme", "dark");

      expect(renderToString(<ThemeProbe />)).toBe(
        '<output aria-label="theme">light</output>',
      );
    });

    it("hydrates that markup without a mismatch, then shows the real theme", async () => {
      const consoleError = vi.spyOn(console, "error");
      const container = document.createElement("div");
      container.innerHTML = renderToString(<ThemeProbe />);
      document.body.append(container);
      html.setAttribute("data-theme", "dark");

      const root = await act(async () =>
        hydrateRoot(container, <ThemeProbe />),
      );

      expect(container).toHaveTextContent("dark");
      expect(consoleError).not.toHaveBeenCalled();

      act(() => root.unmount());
      container.remove();
    });
  });
});
