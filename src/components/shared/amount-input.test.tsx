import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AmountInput } from "./amount-input";

function setup(
  props: Partial<Parameters<typeof AmountInput>[0]> = {},
  value: number | null = null,
) {
  const onChange = vi.fn<(cents: number | null) => void>();
  render(
    <>
      <label htmlFor="amount">Amount</label>
      <AmountInput id="amount" value={value} onChange={onChange} {...props} />
    </>,
  );
  return {
    onChange,
    input: screen.getByRole("textbox", { name: "Amount" }),
    user: userEvent.setup(),
  };
}

describe("AmountInput", () => {
  it("starts empty, with a placeholder, when there is no amount", () => {
    const { input } = setup();

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "0.00");
  });

  it("shows an existing amount as dollars and cents", () => {
    const { input } = setup({}, 125_050);

    expect(input).toHaveValue("1,250.50");
  });

  it("shows a zero amount rather than treating it as empty", () => {
    const { input } = setup({}, 0);

    expect(input).toHaveValue("0.00");
  });

  it("asks mobile keyboards for a decimal pad without becoming a number input", () => {
    const { input } = setup();

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("autocomplete", "off");
  });

  it("reports cents as the person types, without reformatting under the cursor", async () => {
    const { input, onChange, user } = setup();

    await user.type(input, "1250.5");

    expect(input).toHaveValue("1250.5");
    expect(onChange.mock.calls.map(([cents]) => cents)).toEqual([
      1_00, 12_00, 125_00, 1_250_00, 1_250_00, 1_250_50,
    ]);
  });

  it("tidies the text when the person leaves the field", async () => {
    const { input, onChange, user } = setup();

    await user.type(input, "1250.5");
    await user.tab();

    expect(input).toHaveValue("1,250.50");
    expect(onChange).toHaveBeenLastCalledWith(1_250_50);
  });

  it("accepts a pasted amount with a dollar sign and thousands separators", async () => {
    const { input, onChange, user } = setup();

    await user.click(input);
    await user.paste("$12,345.67");

    expect(onChange).toHaveBeenLastCalledWith(12_345_67);
    await user.tab();
    expect(input).toHaveValue("12,345.67");
  });

  it("reports null for text that is not an amount and leaves it for the person to fix", async () => {
    const { input, onChange, user } = setup();

    await user.type(input, "12abc");
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue("12abc");
  });

  it("reports null rather than rounding a third decimal place", async () => {
    const { input, onChange, user } = setup();

    await user.type(input, "1.999");

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("reports null when the field is cleared, and stays empty on blur", async () => {
    const { input, onChange, user } = setup({}, 5_00);

    await user.clear(input);
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue("");
  });

  it("still calls the caller's onBlur, for form libraries tracking touched fields", async () => {
    const onBlur = vi.fn();
    const { input, user } = setup({ onBlur });

    await user.click(input);
    expect(onBlur).not.toHaveBeenCalled();
    await user.tab();

    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onBlur.mock.calls[0][0].target).toBe(input);
  });

  it("passes other input props through and keeps room for the dollar sign", () => {
    const { input } = setup({
      "aria-invalid": true,
      "aria-describedby": "amount-error",
      disabled: true,
      className: "w-40",
    });

    expect(input).toBeInvalid();
    expect(input).toHaveAttribute("aria-describedby", "amount-error");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("w-40", "pl-6");
  });

  it("is seeded from its value once: a later change does not overwrite what was typed", async () => {
    // Callers that need to reset the field remount it (see AmountFilter).
    const user = userEvent.setup();
    const { rerender } = render(
      <AmountInput aria-label="Amount" value={null} onChange={() => {}} />,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    await user.type(input, "12.5");

    rerender(
      <AmountInput aria-label="Amount" value={99_00} onChange={() => {}} />,
    );

    expect(input).toHaveValue("12.5");
  });

  it("shows a decorative dollar sign that is not part of the value", () => {
    setup();

    const sign = screen.getByText("$");
    expect(sign).toHaveAttribute("aria-hidden", "true");
  });
});
