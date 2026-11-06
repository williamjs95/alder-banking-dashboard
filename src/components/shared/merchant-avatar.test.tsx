import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/domain";
import { CATEGORY_ICONS, MerchantAvatar } from "./merchant-avatar";

describe("MerchantAvatar", () => {
  it("is decorative: hidden from assistive tech, with no text of its own", () => {
    const { container } = render(<MerchantAvatar category="payroll" />);

    const avatar = container.firstElementChild;
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(avatar).toHaveTextContent(/^$/);
    expect(avatar?.querySelectorAll("svg")).toHaveLength(1);
  });

  it("has an icon for every category", () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...CATEGORIES].sort());
  });

  it("draws a different glyph for each category", () => {
    const glyphs = CATEGORIES.map((category) => {
      const { container, unmount } = render(
        <MerchantAvatar category={category} />,
      );
      const glyph = container.querySelector("svg")?.innerHTML;
      unmount();
      return glyph;
    });

    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(CATEGORIES.length);
  });

  it("accepts extra classes", () => {
    const { container } = render(
      <MerchantAvatar category="cloud" className="size-10" />,
    );

    expect(container.firstElementChild).toHaveClass("size-10", "rounded-full");
  });
});
