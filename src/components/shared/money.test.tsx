import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Money } from "./money";

describe("Money", () => {
  it("shows cents as dollars", () => {
    render(<Money cents={123_450} />);

    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
  });

  it("shows a minus sign for money out", () => {
    render(<Money cents={-15_137_39} />);

    expect(screen.getByText("-$15,137.39")).toBeInTheDocument();
  });

  it("adds a plus sign to money in when signed", () => {
    render(<Money cents={11_048_20} signed />);

    expect(screen.getByText("+$11,048.20")).toBeInTheDocument();
  });

  it("drops the cents when whole", () => {
    render(<Money cents={60_814_49} whole />);

    expect(screen.getByText("$60,814")).toBeInTheDocument();
  });

  it("turns money in green when toned", () => {
    render(<Money cents={500} tone />);

    expect(screen.getByText("$5.00")).toHaveClass("text-positive");
  });

  it("leaves money out and zero in the normal ink when toned", () => {
    render(
      <>
        <Money cents={-500} tone />
        <Money cents={0} tone />
      </>,
    );

    expect(screen.getByText("-$5.00")).not.toHaveClass("text-positive");
    expect(screen.getByText("$0.00")).not.toHaveClass("text-positive");
  });

  it("does not color money in unless asked to", () => {
    render(<Money cents={500} />);

    expect(screen.getByText("$5.00")).not.toHaveClass("text-positive");
  });

  it("keeps digits aligned and on one line, and accepts extra classes", () => {
    render(<Money cents={500} className="text-right" />);

    expect(screen.getByText("$5.00")).toHaveClass(
      "tabular",
      "whitespace-nowrap",
      "text-right",
    );
  });
});
