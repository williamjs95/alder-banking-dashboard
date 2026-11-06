import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FacetFilter } from "./facet-filter";

const OPTIONS = [
  { value: "posted", label: "Posted" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
] as const;

function setup(selected: readonly string[] = []) {
  const onChange = vi.fn();
  render(
    <FacetFilter
      label="Status"
      options={OPTIONS}
      selected={selected}
      onChange={onChange}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

describe("FacetFilter", () => {
  it("shows only its label while nothing is selected", () => {
    setup();

    expect(screen.getByRole("button")).toHaveAccessibleName("Status");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows how many options are selected", () => {
    setup(["pending", "failed"]);

    const button = screen.getByRole("button", { name: /^Status/ });
    expect(within(button).getByText("2")).toBeVisible();
    // The bare number is spelled out for screen readers.
    expect(button).toHaveTextContent("Status2 selected");
  });

  it("lists every option, ticking the selected ones", async () => {
    const { user } = setup(["pending"]);

    await user.click(screen.getByRole("button", { name: /Status/ }));

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Posted", "Pending", "Failed"]);
    expect(screen.getByRole("checkbox", { name: "Posted" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pending" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Failed" })).not.toBeChecked();
  });

  it("adds an option to the selection when it is ticked", async () => {
    const { onChange, user } = setup(["pending"]);

    await user.click(screen.getByRole("button", { name: /Status/ }));
    await user.click(screen.getByRole("checkbox", { name: "Failed" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["pending", "failed"]);
  });

  it("removes an option from the selection when it is unticked", async () => {
    const { onChange, user } = setup(["posted", "pending", "failed"]);

    await user.click(screen.getByRole("button", { name: /Status/ }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["posted", "failed"]);
  });

  it("toggles an option when its text is clicked, not only the box", async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole("button", { name: "Status" }));
    await user.click(screen.getByText("Posted"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(["posted"]);
  });

  it("clears the whole selection", async () => {
    const { onChange, user } = setup(["pending", "failed"]);

    await user.click(screen.getByRole("button", { name: /Status/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
  });

  it("offers no Clear button when there is nothing to clear", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Status" }));

    expect(screen.getByRole("checkbox", { name: "Posted" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
  });
});
