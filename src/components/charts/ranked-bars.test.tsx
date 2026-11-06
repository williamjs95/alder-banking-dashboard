import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankedBars, type RankedBar } from "./ranked-bars";

const ITEMS: RankedBar[] = [
  {
    key: "gusto",
    label: "Gusto Payroll",
    value: 450_848_00,
    display: "$450,848",
    detail: "6 payments",
    href: "/transactions?q=Gusto+Payroll",
  },
  {
    key: "aws",
    label: "Amazon Web Services",
    value: 112_712_00,
    display: "$112,712",
  },
  { key: "none", label: "Notion", value: 0, display: "$0" },
];

/** The filled part of a row's bar. */
const bar = (row: HTMLElement) =>
  row.querySelector<HTMLElement>("[style*='width']")!;

describe("RankedBars", () => {
  it("lists every item in the order given, with its value as text", () => {
    render(<RankedBars items={ITEMS} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Gusto Payroll")).toBeInTheDocument();
    expect(within(rows[0]).getByText("$450,848")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText("Amazon Web Services"),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText("$112,712")).toBeInTheDocument();
    expect(within(rows[2]).getByText("$0")).toBeInTheDocument();
  });

  it("shows secondary detail only for items that have it", () => {
    render(<RankedBars items={ITEMS} />);

    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText("6 payments")).toBeInTheDocument();
    expect(second).toHaveTextContent(/^Amazon Web Services\$112,712$/);
  });

  it("links an item with an href and leaves the others as plain rows", () => {
    render(<RankedBars items={ITEMS} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/transactions?q=Gusto+Payroll");
    expect(links[0]).toHaveTextContent("Gusto Payroll");
    expect(links[0]).toHaveTextContent("$450,848");
  });

  it("sizes each bar against the largest value", () => {
    render(<RankedBars items={ITEMS} />);

    const [first, second] = screen.getAllByRole("listitem");
    expect(bar(first)).toHaveStyle({ width: "100%" });
    expect(bar(second)).toHaveStyle({ width: "25%" });
  });

  it("keeps a sliver of bar for a zero value, so the row still reads as a bar", () => {
    render(<RankedBars items={ITEMS} />);

    expect(bar(screen.getAllByRole("listitem")[2])).toHaveStyle({
      width: "1%",
    });
  });

  it("does not divide by zero when every value is zero", () => {
    render(
      <RankedBars
        items={[
          { key: "a", label: "A", value: 0, display: "$0" },
          { key: "b", label: "B", value: 0, display: "$0" },
        ]}
      />,
    );

    for (const row of screen.getAllByRole("listitem")) {
      expect(bar(row)).toHaveStyle({ width: "1%" });
    }
  });

  it("scales against the largest value wherever it sits in the list", () => {
    render(
      <RankedBars
        items={[
          { key: "small", label: "Small", value: 50, display: "$0.50" },
          { key: "big", label: "Big", value: 200, display: "$2.00" },
        ]}
      />,
    );

    const [small, big] = screen.getAllByRole("listitem");
    expect(bar(small)).toHaveStyle({ width: "25%" });
    expect(bar(big)).toHaveStyle({ width: "100%" });
  });

  it("renders an empty list for no items", () => {
    render(<RankedBars items={[]} />);

    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });
});
