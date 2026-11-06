import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./logo";

describe("Logo", () => {
  it("spells out the product name next to a decorative mark", () => {
    const { container } = render(<Logo />);

    expect(screen.getByText("Alder")).toBeInTheDocument();
    const marks = container.querySelectorAll("svg");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts extra classes without losing its own layout", () => {
    const { container } = render(<Logo className="text-brand" />);

    expect(container.firstElementChild).toHaveClass(
      "flex",
      "items-center",
      "text-brand",
    );
  });
});
