import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cards } from "../../../test/fixtures";
import { CardVisual } from "./card-visual";

const [activeCard, frozenCard] = cards;

describe("CardVisual", () => {
  it("shows the label, type, masked number, holder and expiry", () => {
    render(<CardVisual card={activeCard} />);

    expect(screen.getByText("Cloud infrastructure")).toBeInTheDocument();
    expect(screen.getByText("virtual")).toBeInTheDocument();
    expect(screen.getByText("•••• •••• •••• 4417")).toBeInTheDocument();
    expect(screen.getByText("Maya Chen")).toBeInTheDocument();
    expect(screen.getByText("06/28")).toBeInTheDocument();
  });

  it("keeps two-digit months as they are", () => {
    render(
      <CardVisual card={{ ...activeCard, expMonth: 11, expYear: 2031 }} />,
    );

    expect(screen.getByText("11/31")).toBeInTheDocument();
  });

  it("does not mark an active card as frozen", () => {
    render(<CardVisual card={activeCard} />);

    expect(screen.queryByText("Frozen")).not.toBeInTheDocument();
  });

  it("marks a frozen card", () => {
    render(<CardVisual card={frozenCard} />);

    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getByText("•••• •••• •••• 1186")).toBeInTheDocument();
  });
});
