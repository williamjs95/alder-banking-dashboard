import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton } from "./page-skeleton";

describe("PageSkeleton", () => {
  it("announces what is loading and that the region is busy", () => {
    render(<PageSkeleton label="Loading transactions" />);

    expect(screen.getByLabelText("Loading transactions")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("holds two placeholder blocks and no text", () => {
    render(<PageSkeleton label="Loading cards" />);

    const region = screen.getByLabelText("Loading cards");
    expect(region.children).toHaveLength(2);
    expect(region).toHaveTextContent(/^$/);
  });
});
