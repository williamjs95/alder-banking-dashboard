import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";

const OPTIONS = [
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "365", label: "1Y" },
] as const;
type Range = (typeof OPTIONS)[number]["value"];

describe("SegmentedControl", () => {
  it("is a named group with one radio per option, in order", () => {
    render(
      <SegmentedControl
        label="Balance range"
        options={OPTIONS}
        value="90"
        onChange={() => {}}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Balance range" });
    expect(group).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.textContent),
    ).toEqual(["30D", "90D", "1Y"]);
  });

  it("checks only the current value", () => {
    render(
      <SegmentedControl
        label="Balance range"
        options={OPTIONS}
        value="90"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: "90D" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "30D" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "1Y" })).not.toBeChecked();
  });

  it("reports the value of the option that was clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Balance range"
        options={OPTIONS}
        value="90"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "1Y" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("365");
  });

  it("can be operated from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Balance range"
        options={OPTIONS}
        value="90"
        onChange={onChange}
      />,
    );

    await user.tab();
    expect(screen.getByRole("radio", { name: "30D" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("30");
  });

  it("moves the selection when its owner updates the value", async () => {
    const user = userEvent.setup();
    function Owner() {
      const [range, setRange] = useState<Range>("30");
      return (
        <SegmentedControl
          label="Balance range"
          options={OPTIONS}
          value={range}
          onChange={setRange}
        />
      );
    }
    render(<Owner />);

    await user.click(screen.getByRole("radio", { name: "1Y" }));

    expect(screen.getByRole("radio", { name: "1Y" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "30D" })).not.toBeChecked();
  });

  it("does not submit a surrounding form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SegmentedControl
          label="Balance range"
          options={OPTIONS}
          value="90"
          onChange={() => {}}
        />
      </form>,
    );

    await user.click(screen.getByRole("radio", { name: "30D" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
