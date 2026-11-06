// Plain module (no "use client") so the root layout can read these as values.

export const THEME_STORAGE_KEY = "alder-theme";

/**
 * Runs in <head> before first paint, so the page never flashes the wrong
 * theme. A saved choice wins; otherwise the operating system preference does.
 */
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
