import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AmountFilter,
  describeAmount,
  type AmountRange,
} from "./amount-filter";

const INVERTED_MESSAGE = "The maximum must be at least the minimum.";

function setup(value: AmountRange = {}) {
  const onChange = vi.fn();
  render(<AmountFilter value={value} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

/** Opens the popover; its trigger is the only button until then. */
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button"));
}

describe("describeAmount", () => {
  it("names both bounds of a closed range", () => {
    expect(describeAmount({ minCents: 500_00, maxCents: 1_000_00 })).toBe(
      "$500 – $1,000",
    );
  });

  it("describes a range with only a minimum", () => {
    expect(describeAmount({ minCents: 500_00 })).toBe("At least $500");
  });

  it("describes a range with only a maximum", () => {
    expect(describeAmount({ maxCents: 1_000_00 })).toBe("Up to $1,000");
  });

  it("keeps the cents when a bound is not a whole dollar amount", () => {
    expect(describeAmount({ minCents: 12_50, maxCents: 99_99 })).toBe(
      "$12.50 – $99.99",
    );
  });

  it("treats zero as a real bound", () => {
    expect(describeAmount({ minCents: 0 })).toBe("At least $0");
    expect(describeAmount({ maxCents: 0 })).toBe("Up to $0");
  });

  it("says so when there is no range", () => {
    expect(describeAmount({})).toBe("Any amount");
  });
});

describe("AmountFilter", () => {
  it("shows the applied range on its button", () => {
    setup({ minCents: 500_00, maxCents: 1_000_00 });

    expect(screen.getByRole("button")).toHaveAccessibleName("$500 – $1,000");
  });

  it("reads “Any amount” and stays closed until asked", () => {
    setup();

    expect(screen.getByRole("button")).toHaveAccessibleName("Any amount");
    expect(screen.queryByLabelText("Minimum")).not.toBeInTheDocument();
  });

  it("applies a typed range in cents and closes", async () => {
    const { onChange, user } = setup();

    await open(user);
    await user.type(screen.getByLabelText("Minimum"), "500");
    await user.type(screen.getByLabelText("Maximum"), "1,250.50");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      minCents: 500_00,
      maxCents: 1_250_50,
    });
    expect(screen.queryByLabelText("Minimum")).not.toBeInTheDocument();
  });

  it("applies when Enter is pressed in a field", async () => {
    const { onChange, user } = setup();

    await open(user);
    await user.type(screen.getByLabelText("Maximum"), "75{Enter}");

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      minCents: undefined,
      maxCents: 75_00,
    });
  });

  it("applies a minimum on its own", async () => {
    const { onChange, user } = setup();

    await open(user);
    await user.type(screen.getByLabelText("Minimum"), "20");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      minCents: 20_00,
      maxCents: undefined,
    });
  });

  it("accepts a range whose two bounds are equal", async () => {
    const { onChange, user } = setup();

    await open(user);
    await user.type(screen.getByLabelText("Minimum"), "100");
    await user.type(screen.getByLabelText("Maximum"), "100");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      minCents: 100_00,
      maxCents: 100_00,
    });
  });

  it("starts from the applied range", async () => {
    const { user } = setup({ minCents: 500_00, maxCents: 1_000_00 });

    await open(user);

    expect(screen.getByLabelText("Minimum")).toHaveValue("500.00");
    expect(screen.getByLabelText("Maximum")).toHaveValue("1,000.00");
  });

  it("removes a bound when its field is emptied", async () => {
    const { onChange, user } = setup({ minCents: 500_00, maxCents: 1_000_00 });

    await open(user);
    await user.clear(screen.getByLabelText("Minimum"));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      minCents: undefined,
      maxCents: 1_000_00,
    });
  });

  it("discards unapplied typing when it is closed and reopened", async () => {
    const { onChange, user } = setup({ minCents: 500_00 });

    await open(user);
    await user.clear(screen.getByLabelText("Minimum"));
    await user.type(screen.getByLabelText("Minimum"), "9999");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Minimum")).not.toBeInTheDocument();

    await open(user);

    expect(screen.getByLabelText("Minimum")).toHaveValue("500.00");
    expect(onChange).not.toHaveBeenCalled();
  });

  describe("when the maximum is below the minimum", () => {
    async function typeInvertedRange(user: ReturnType<typeof userEvent.setup>) {
      await open(user);
      await user.type(screen.getByLabelText("Minimum"), "1000");
      await user.type(screen.getByLabelText("Maximum"), "500");
    }

    it("explains the problem and marks the maximum invalid", async () => {
      const { user } = setup();

      await typeInvertedRange(user);

      expect(screen.getByRole("alert")).toHaveTextContent(INVERTED_MESSAGE);
      expect(screen.getByLabelText("Maximum")).toBeInvalid();
      expect(screen.getByLabelText("Minimum")).toBeValid();
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    it("does not apply, however the form is submitted", async () => {
      const { onChange, user } = setup();

      await typeInvertedRange(user);
      await user.type(screen.getByLabelText("Maximum"), "{Enter}");
      // The disabled button blocks implicit submission; `requestSubmit()`
      // from a script or a browser extension would not be blocked.
      fireEvent.submit(screen.getByLabelText("Maximum").closest("form")!);

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(INVERTED_MESSAGE);
    });

    it("recovers once the range is corrected", async () => {
      const { onChange, user } = setup();

      await typeInvertedRange(user);
      await user.clear(screen.getByLabelText("Maximum"));
      await user.type(screen.getByLabelText("Maximum"), "2000");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Maximum")).toBeValid();
      await user.click(screen.getByRole("button", { name: "Apply" }));

      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        minCents: 1_000_00,
        maxCents: 2_000_00,
      });
    });
  });

  it("clears the applied range and closes", async () => {
    const { onChange, user } = setup({ minCents: 500_00, maxCents: 1_000_00 });

    await open(user);
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith({});
    expect(screen.queryByLabelText("Minimum")).not.toBeInTheDocument();
  });
});
