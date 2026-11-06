import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TRANSACTION_STATUSES } from "@/lib/domain";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it.each([
    ["posted", "Posted"],
    ["pending", "Pending"],
    ["scheduled", "Scheduled"],
    ["failed", "Failed"],
  ] as const)("spells out the %s status as text", (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("pairs every status with a decorative icon, so color is never the only cue", () => {
    for (const status of TRANSACTION_STATUSES) {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const icons = container.querySelectorAll("svg");

      expect(icons).toHaveLength(1);
      expect(icons[0]).toHaveAttribute("aria-hidden", "true");
      unmount();
    }
  });

  it("uses a different icon for each status", () => {
    const iconClasses = TRANSACTION_STATUSES.map((status) => {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const classes = container.querySelector("svg")?.getAttribute("class");
      unmount();
      return classes;
    });

    expect(new Set(iconClasses).size).toBe(TRANSACTION_STATUSES.length);
  });

  it("draws attention to failures and keeps posted quiet", () => {
    render(
      <>
        <StatusBadge status="failed" />
        <StatusBadge status="posted" />
      </>,
    );

    expect(screen.getByText("Failed")).toHaveClass("text-destructive");
    expect(screen.getByText("Posted")).toHaveClass("text-muted-foreground");
  });

  it("accepts extra classes", () => {
    render(<StatusBadge status="pending" className="ml-2" />);

    expect(screen.getByText("Pending")).toHaveClass("ml-2");
  });
});
