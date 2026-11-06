import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SuccessPanel, SummaryRow } from "./success-panel";

describe("SuccessPanel", () => {
  it("announces the outcome as a status with its follow-up actions", () => {
    render(
      <SuccessPanel
        title="Payment sent"
        description="$500.00 to Pilot.com, Inc. is on its way."
      >
        <button type="button">Done</button>
      </SuccessPanel>,
    );

    const status = screen.getByRole("status");
    expect(within(status).getByText("Payment sent")).toBeInTheDocument();
    expect(
      within(status).getByText("$500.00 to Pilot.com, Inc. is on its way."),
    ).toBeInTheDocument();
    expect(within(status).getByRole("button", { name: "Done" })).toBeVisible();
  });
});

describe("SummaryRow", () => {
  it("pairs a label with its value as a term and definition", () => {
    render(
      <dl>
        <SummaryRow label="Method">ACH</SummaryRow>
      </dl>,
    );

    expect(screen.getByRole("term")).toHaveTextContent("Method");
    const value = screen.getByRole("definition");
    expect(value).toHaveTextContent("ACH");
    expect(value).not.toHaveClass("font-semibold");
  });

  it("emphasizes a strong row, such as the total", () => {
    render(
      <dl>
        <SummaryRow label="Total" strong>
          $515.00
        </SummaryRow>
      </dl>,
    );

    const value = screen.getByRole("definition");
    expect(value).toHaveTextContent("$515.00");
    expect(value).toHaveClass("font-semibold");
  });
});
