"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const readTheme = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing can refuse storage; the theme still applies for this visit.
  }
  for (const listener of listeners) listener();
}

/** The active theme, in sync with the attribute the inline script set. */
export function useTheme(): Theme {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    (): Theme => "light",
  );

  // React's dev-only remount resets <html> attributes it does not own.
  // Re-apply the saved choice; in production this finds nothing to change.
  useLayoutEffect(() => {
    const stored = readStoredTheme();
    if (stored && stored !== readTheme()) setTheme(stored);
  }, []);

  return theme;
}
