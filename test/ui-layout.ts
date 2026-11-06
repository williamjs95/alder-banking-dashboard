import { vi } from "vitest";

/**
 * jsdom has no layout engine, so every element measures 0 by 0 and Recharts'
 * `ResponsiveContainer` draws nothing. This gives every element the same box,
 * anchored at the top-left of the viewport, so charts render and pointer
 * coordinates map straight onto chart coordinates.
 *
 * The stubs are spies: undo them with `vi.restoreAllMocks()`.
 */
export function stubLayout({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } satisfies DOMRect;
  const proto = window.HTMLElement.prototype;
  vi.spyOn(proto, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(proto, "offsetWidth", "get").mockReturnValue(width);
  vi.spyOn(proto, "offsetHeight", "get").mockReturnValue(height);
}
