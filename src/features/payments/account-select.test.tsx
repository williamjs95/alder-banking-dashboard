import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { accounts, ids } from "../../../test/fixtures";
import { AccountSelect } from "./account-select";

function setup(props: Partial<Parameters<typeof AccountSelect>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <>
      <label htmlFor="account">Pay from</label>
      <AccountSelect
        id="account"
        accounts={accounts}
        value={undefined}
        onChange={onChange}
        {...props}
      />
    </>,
  );
  return { onChange, user: userEvent.setup() };
}

describe("AccountSelect", () => {
  it("shows a placeholder until an account is chosen", () => {
    setup();

    expect(
      screen.getByRole("combobox", { name: "Pay from" }),
    ).toHaveTextContent("Choose an account");
  });

  it("treats an empty value as no selection and accepts a custom placeholder", () => {
    setup({ value: "", placeholder: "Pick the funding account" });

    expect(
      screen.getByRole("combobox", { name: "Pay from" }),
    ).toHaveTextContent("Pick the funding account");
  });

  it("shows the selected account with its balance", () => {
    setup({ value: ids.savings });

    const trigger = screen.getByRole("combobox", { name: "Pay from" });
    expect(trigger).toHaveTextContent("Savings Reserve");
    expect(trigger).toHaveTextContent("$600,000.00");
  });

  it("lists every account beside its available balance", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("combobox", { name: "Pay from" }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Operating Checking");
    expect(options[0]).toHaveTextContent("$250,000.00");
    expect(options[1]).toHaveTextContent("Savings Reserve");
    expect(options[1]).toHaveTextContent("$600,000.00");
    expect(options[2]).toHaveTextContent("Treasury");
    expect(options[2]).toHaveTextContent("$900,000.00");
  });

  it("reports the id of the account that was picked", async () => {
    const { onChange, user } = setup({ value: ids.checking });

    await user.click(screen.getByRole("combobox", { name: "Pay from" }));
    await user.click(screen.getByRole("option", { name: /Treasury/ }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(ids.treasury);
  });

  it("passes validation state through to the trigger", () => {
    setup({ "aria-invalid": true, "aria-describedby": "account-error" });

    const trigger = screen.getByRole("combobox", { name: "Pay from" });
    expect(trigger).toBeInvalid();
    expect(trigger).toHaveAttribute("aria-describedby", "account-error");
  });
});
