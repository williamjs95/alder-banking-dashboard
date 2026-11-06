import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Delta } from "./delta";

const LABEL = "vs previous 30 days";

describe("Delta", () => {
  it("says there is nothing to compare against when the previous period was zero", () => {
    render(<Delta current={500} previous={0} goodWhen="up" label={LABEL} />);

    expect(screen.getByText("No earlier data")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says nothing changed when both periods match", () => {
    render(<Delta current={500} previous={500} goodWhen="up" label={LABEL} />);

    expect(
      screen.getByText("No change vs previous 30 days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("treats a change that would round to 0.0% as no change", () => {
    // 0.04% up: too small to show as a percentage.
    render(
      <Delta current={100_04} previous={100_00} goodWhen="up" label={LABEL} />,
    );

    expect(
      screen.getByText("No change vs previous 30 days"),
    ).toBeInTheDocument();
  });

  it("shows the smallest change that rounds to 0.1%", () => {
    render(
      <Delta current={100_05} previous={100_00} goodWhen="up" label={LABEL} />,
    );

    expect(screen.getByText("+0.1%", { exact: false })).toBeInTheDocument();
  });

  it("shows a rise as good news when up is good", () => {
    render(
      <Delta
        current={212_062_00}
        previous={205_000_00}
        goodWhen="up"
        label={LABEL}
      />,
    );

    const change = screen.getByText("+3.4%", { exact: false });
    expect(change).toHaveTextContent("Up+3.4%");
    expect(change).toHaveClass("text-positive");
    expect(change.parentElement).toHaveTextContent(
      "Up+3.4%vs previous 30 days",
    );
  });

  it("shows a rise as bad news when down is good", () => {
    render(
      <Delta
        current={274_530_00}
        previous={263_000_00}
        goodWhen="down"
        label={LABEL}
      />,
    );

    const change = screen.getByText("+4.4%", { exact: false });
    expect(change).toHaveTextContent("Up+4.4%");
    expect(change).toHaveClass("text-destructive");
  });

  it("shows a fall as good news when down is good", () => {
    render(<Delta current={75} previous={100} goodWhen="down" label={LABEL} />);

    const change = screen.getByText("-25.0%", { exact: false });
    expect(change).toHaveTextContent("Down-25.0%");
    expect(change).toHaveClass("text-positive");
  });

  it("shows a fall as bad news when up is good", () => {
    render(<Delta current={75} previous={100} goodWhen="up" label={LABEL} />);

    const change = screen.getByText("-25.0%", { exact: false });
    expect(change).toHaveTextContent("Down-25.0%");
    expect(change).toHaveClass("text-destructive");
  });

  it("names the direction for screen readers and hides the arrow from them", () => {
    const { container } = render(
      <Delta current={150} previous={100} goodWhen="up" label={LABEL} />,
    );

    expect(screen.getByText("Up")).toHaveClass("sr-only");
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("accepts extra classes in every state", () => {
    const { rerender, container } = render(
      <Delta
        current={1}
        previous={0}
        goodWhen="up"
        label={LABEL}
        className="mt-1"
      />,
    );
    expect(container.firstElementChild).toHaveClass("mt-1");

    rerender(
      <Delta
        current={2}
        previous={1}
        goodWhen="up"
        label={LABEL}
        className="mt-1"
      />,
    );
    expect(container.firstElementChild).toHaveClass("mt-1");
  });
});
