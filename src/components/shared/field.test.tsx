import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, fieldAria } from "./field";

function MemoField({ error, hint }: { error?: string; hint?: string }) {
  return (
    <Field id="memo" label="Memo" error={error} hint={hint}>
      <input {...fieldAria("memo", error, hint)} />
    </Field>
  );
}

describe("Field", () => {
  it("labels its control", () => {
    render(<MemoField />);

    expect(screen.getByLabelText("Memo")).toBe(screen.getByRole("textbox"));
  });

  it("has no hint or error unless given one", () => {
    render(<MemoField />);

    const input = screen.getByRole("textbox", { name: "Memo" });
    expect(input).not.toHaveAccessibleDescription();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("describes the control with its hint", () => {
    render(<MemoField hint="Shown on the recipient's statement." />);

    const input = screen.getByRole("textbox", { name: "Memo" });
    expect(input).toHaveAccessibleDescription(
      "Shown on the recipient's statement.",
    );
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("announces an error and marks the control invalid", () => {
    render(<MemoField error="Keep the memo under 140 characters" />);

    const input = screen.getByRole("textbox", { name: "Memo" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Keep the memo under 140 characters",
    );
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(
      "Keep the memo under 140 characters",
    );
  });

  it("shows the error in place of the hint when there are both", () => {
    render(<MemoField error="Too long" hint="Optional" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Too long");
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Too long");
  });
});

describe("fieldAria", () => {
  it("carries only the id when there is nothing to describe", () => {
    expect(fieldAria("amount")).toEqual({
      id: "amount",
      "aria-invalid": undefined,
      "aria-describedby": undefined,
    });
  });

  it("points at the hint", () => {
    expect(fieldAria("amount", undefined, "In US dollars")).toEqual({
      id: "amount",
      "aria-invalid": undefined,
      "aria-describedby": "amount-hint",
    });
  });

  it("points at the error and marks the control invalid", () => {
    expect(fieldAria("amount", "Enter an amount")).toEqual({
      id: "amount",
      "aria-invalid": true,
      "aria-describedby": "amount-error",
    });
  });

  it("prefers the error over the hint", () => {
    expect(
      fieldAria("amount", "Enter an amount", "In US dollars")[
        "aria-describedby"
      ],
    ).toBe("amount-error");
  });

  it("treats an empty error message as no error", () => {
    expect(fieldAria("amount", "", "In US dollars")).toEqual({
      id: "amount",
      "aria-invalid": undefined,
      "aria-describedby": "amount-hint",
    });
  });
});
