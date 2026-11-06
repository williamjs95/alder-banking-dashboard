import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewSkeleton } from "./overview-skeleton";

describe("OverviewSkeleton", () => {
  it("announces that the overview is loading", () => {
    render(<OverviewSkeleton />);

    expect(screen.getByLabelText("Loading overview")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("reserves a block for each of the overview's eight panels", () => {
    render(<OverviewSkeleton />);

    // Two chart rows of two panels each, around a row of four stat tiles.
    const rows = Array.from(screen.getByLabelText("Loading overview").children);
    expect(
      rows.map((row) => row.querySelectorAll('[data-slot="skeleton"]').length),
    ).toEqual([2, 4, 2]);
  });
});
