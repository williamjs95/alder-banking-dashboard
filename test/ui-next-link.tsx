import type { ComponentProps } from "react";

/**
 * Stand-in for `next/link` in tests that click links. Without an app router
 * the real component lets the browser follow the href, which jsdom reports as
 * "Not implemented: navigation". Like the real one inside an app, this runs
 * the caller's `onClick` and then handles the navigation itself.
 *
 *   vi.mock("next/link", () => import("../../../test/ui-next-link"));
 */
export default function Link({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    />
  );
}
