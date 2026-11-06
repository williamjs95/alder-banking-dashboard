import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as the page's top-level heading", () => {
    render(<PageHeader title="Transactions" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Transactions" }),
    ).toBeInTheDocument();
  });

  it("renders nothing but the title when given only a title", () => {
    const { container } = render(<PageHeader title="Transactions" />);

    expect(container).toHaveTextContent(/^Transactions$/);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("shows the description under the title", () => {
    render(
      <PageHeader
        title="Cards"
        description="Issue and manage virtual cards."
      />,
    );

    expect(
      screen.getByText("Issue and manage virtual cards."),
    ).toBeInTheDocument();
  });

  it("renders the actions it is given", () => {
    render(
      <PageHeader title="Cards" actions={<button>Issue a card</button>} />,
    );

    expect(
      screen.getByRole("button", { name: "Issue a card" }),
    ).toBeInTheDocument();
  });
});
