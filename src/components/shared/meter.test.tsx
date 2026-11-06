import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter, meterLevel } from "./meter";

describe("meterLevel", () => {
  it.each([
    [0, 100, "normal"],
    [79, 100, "normal"],
    [79.99, 100, "normal"],
    [80, 100, "warning"],
    [99.99, 100, "warning"],
    [100, 100, "critical"],
    [250, 100, "critical"],
  ] as const)("%d of %d is %s", (value, max, level) => {
    expect(meterLevel(value, max)).toBe(level);
  });

  it("is critical when there is no limit to measure against", () => {
    expect(meterLevel(0, 0)).toBe("critical");
    expect(meterLevel(10, -5)).toBe("critical");
  });
});

/** The bar inside the meter, whose width and color show the level. */
const fill = (meter: HTMLElement) => meter.firstElementChild as HTMLElement;

describe("Meter", () => {
  it("exposes the value against its limit under the given label", () => {
    render(
      <Meter value={4_200_00} max={8_000_00} label="$4,200 of $8,000 used" />,
    );

    const meter = screen.getByRole("meter", { name: "$4,200 of $8,000 used" });
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "800000");
    expect(meter).toHaveAttribute("aria-valuenow", "420000");
  });

  it("fills in proportion to the value, in the normal color below 80%", () => {
    render(<Meter value={50} max={200} label="25% used" />);

    const bar = fill(screen.getByRole("meter"));
    expect(bar).toHaveStyle({ width: "25%" });
    expect(bar).toHaveClass("bg-brand");
  });

  it("warns from 80% of the limit", () => {
    render(<Meter value={80} max={100} label="80% used" />);

    const bar = fill(screen.getByRole("meter"));
    expect(bar).toHaveStyle({ width: "80%" });
    expect(bar).toHaveClass("bg-warning");
  });

  it("is critical at the limit", () => {
    render(<Meter value={100} max={100} label="All used" />);

    const bar = fill(screen.getByRole("meter"));
    expect(bar).toHaveStyle({ width: "100%" });
    expect(bar).toHaveClass("bg-critical");
  });

  it("caps the bar and the reported value at the limit when over it", () => {
    render(<Meter value={150} max={100} label="Over the limit" />);

    const meter = screen.getByRole("meter", { name: "Over the limit" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(fill(meter)).toHaveStyle({ width: "100%" });
    expect(fill(meter)).toHaveClass("bg-critical");
  });

  it("never draws a negative width or reports a value below its minimum", () => {
    render(<Meter value={-20} max={100} label="Refunded" />);

    const meter = screen.getByRole("meter");
    expect(fill(meter)).toHaveStyle({ width: "0%" });
    expect(meter).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows a full, critical bar when the limit is zero", () => {
    render(<Meter value={0} max={0} label="No limit set" />);

    const meter = screen.getByRole("meter", { name: "No limit set" });
    expect(meter).toHaveAttribute("aria-valuemax", "0");
    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(fill(meter)).toHaveStyle({ width: "100%" });
    expect(fill(meter)).toHaveClass("bg-critical");
  });

  it("accepts extra classes", () => {
    render(<Meter value={1} max={2} label="Half" className="mt-3" />);

    expect(screen.getByRole("meter")).toHaveClass("mt-3");
  });
});
