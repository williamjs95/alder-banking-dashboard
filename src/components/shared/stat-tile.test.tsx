import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("shows the label with its value", () => {
    render(<StatTile label="Total balance" value="$1,750,000.00" />);

    expect(screen.getByText("Total balance")).toBeInTheDocument();
    expect(screen.getByText("$1,750,000.00")).toBeInTheDocument();
  });

  it("accepts rich content as the value", () => {
    render(
      <StatTile
        label="Runway"
        value={
          <>
            28.7 <abbr title="months">mo</abbr>
          </>
        }
      />,
    );

    expect(screen.getByTitle("months")).toHaveTextContent("mo");
    expect(screen.getByText(/28\.7/)).toBeInTheDocument();
  });

  it("shows a footer line when given one", () => {
    render(
      <StatTile
        label="Money in"
        value="$212,062.00"
        footer={<span>+3.4% vs previous 30 days</span>}
      />,
    );

    expect(screen.getByText("+3.4% vs previous 30 days")).toBeInTheDocument();
  });

  it("has no footer otherwise", () => {
    const { container } = render(<StatTile label="Money in" value="$5.00" />);

    expect(container).toHaveTextContent(/^Money in\$5\.00$/);
  });
});
