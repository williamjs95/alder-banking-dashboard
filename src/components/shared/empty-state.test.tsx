import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("explains what is missing", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No transactions match"
        description="Try a wider date range or clear the filters."
      />,
    );

    expect(screen.getByText("No transactions match")).toBeInTheDocument();
    expect(
      screen.getByText("Try a wider date range or clear the filters."),
    ).toBeInTheDocument();
  });

  it("hides its icon from assistive tech", () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="Nothing here" description="Yet." />,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("offers the action it is given", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="No recipients yet"
        description="Add one to send a payment."
        action={<button>Add recipient</button>}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Add recipient" }),
    ).toBeInTheDocument();
  });

  it("has no action area otherwise", () => {
    const { container } = render(
      <EmptyState icon={Inbox} title="Nothing here" description="Yet." />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container).toHaveTextContent(/^Nothing hereYet\.$/);
  });
});
