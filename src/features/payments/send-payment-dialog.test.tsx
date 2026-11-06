import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentResultDto, TransactionDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import {
  accounts,
  ids,
  recipients,
  transactions,
} from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { SendPaymentDialog } from "./send-payment-dialog";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PAYMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const sentPayment: TransactionDto = {
  ...transactions.stripe,
  id: PAYMENT_ID,
  description: "Pilot.com, Inc.",
  amountCents: -500_00,
  category: "services",
  status: "pending",
  reference: "ALD-PAY00001",
  recipientId: ids.recipientPilot,
};
const sentResult: PaymentResultDto = { payment: sentPayment, fee: null };

const fetchMock = vi.fn<typeof fetch>();

/** The request the dialog made on its `index`-th call to the API. */
function requestAt(index: number) {
  const [url, init] = fetchMock.mock.calls[index];
  return {
    url,
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

function setup(props: Partial<Parameters<typeof SendPaymentDialog>[0]> = {}) {
  const onClose = vi.fn();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.accounts, accounts);
  renderWithProviders(
    <SendPaymentDialog
      open
      onClose={onClose}
      accounts={accounts}
      recipients={recipients}
      {...props}
    />,
    { queryClient },
  );
  return { onClose, queryClient, user: userEvent.setup() };
}

async function chooseRecipient(user: UserEvent, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Recipient" }));
  await user.click(screen.getByRole("option", { name }));
}

async function enterAmount(user: UserEvent, amount: string) {
  const field = screen.getByRole("textbox", { name: "Amount" });
  await user.clear(field);
  await user.type(field, amount);
}

const review = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Review payment" }));

/** Fills the form for a payment to Pilot.com (ACH by default) and opens the review. */
async function reviewPaymentToPilot(user: UserEvent, amount = "500") {
  await chooseRecipient(user, "Pilot.com, Inc.");
  await enterAmount(user, amount);
  await review(user);
  return screen.findByRole("dialog", { name: "Review payment" });
}

/** The review step's label/value rows, in order, as plain text. */
function summaryRows() {
  const dialog = screen.getByRole("dialog", { name: "Review payment" });
  return Object.fromEntries(
    within(dialog)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  );
}

beforeEach(() => {
  // Only the clock is faked: "tomorrow" must be stable, timers stay real.
  vi.useFakeTimers({
    toFake: ["Date"],
    now: new Date("2026-06-18T12:00:00.000Z"),
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SendPaymentDialog", () => {
  describe("details step", () => {
    it("renders nothing while closed", () => {
      setup({ open: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("starts from the first account, ACH, and no recipient", () => {
      setup();

      expect(
        screen.getByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Choose a recipient");
      expect(screen.getByRole("combobox", { name: "From" })).toHaveTextContent(
        "Operating Checking",
      );
      expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
      expect(screen.getByRole("radio", { name: "ACH · free" })).toBeChecked();
      expect(
        screen.getByRole("radio", { name: "Wire · $15" }),
      ).not.toBeChecked();
      expect(
        screen.getByText("Arrives in 1 to 2 business days."),
      ).toBeInTheDocument();
    });

    it("only offers send dates from tomorrow on", () => {
      setup();

      const date = screen.getByLabelText("Send on");
      expect(date).toHaveAttribute("min", "2026-06-19");
      expect(date).toHaveAccessibleDescription("Leave empty to send today.");
    });

    it("asks for a recipient and an amount when submitted empty", async () => {
      const { user } = setup();

      await review(user);

      const recipient = await screen.findByRole("combobox", {
        name: "Recipient",
      });
      expect(recipient).toBeInvalid();
      expect(recipient).toHaveAccessibleDescription("Choose a recipient");
      const amount = screen.getByRole("textbox", { name: "Amount" });
      expect(amount).toBeInvalid();
      expect(amount).toHaveAccessibleDescription("Enter an amount");
      expect(
        screen.getAllByRole("alert").map((alert) => alert.textContent),
      ).toEqual(["Choose a recipient", "Enter an amount"]);
      expect(
        screen.getByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks for an account when the workspace has none to pay from", async () => {
      const { user } = setup({ accounts: [] });

      expect(screen.getByRole("combobox", { name: "From" })).toHaveTextContent(
        "Choose an account",
      );
      await review(user);

      expect(
        await screen.findByRole("combobox", { name: "From" }),
      ).toHaveAccessibleDescription("Choose an account");
    });

    it("rejects an amount that is cleared, unreadable or zero", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Pilot.com, Inc.");
      const amount = screen.getByRole("textbox", { name: "Amount" });

      await user.type(amount, "12.345");
      await review(user);
      await waitFor(() =>
        expect(amount).toHaveAccessibleDescription("Enter an amount"),
      );

      await enterAmount(user, "0");
      await review(user);
      await waitFor(() =>
        expect(amount).toHaveAccessibleDescription(
          "Enter an amount greater than zero",
        ),
      );

      await enterAmount(user, "10,000,000.01");
      await review(user);
      await waitFor(() =>
        expect(amount).toHaveAccessibleDescription(
          "Amount is above the per-payment limit",
        ),
      );
      expect(
        screen.getByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
    });

    it("switches to the chosen recipient's default method", async () => {
      const { user } = setup();

      await chooseRecipient(user, "Gunderson Dettmer LLP");
      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Gunderson Dettmer LLP");
      expect(screen.getByRole("radio", { name: "Wire · $15" })).toBeChecked();
      expect(
        screen.getByText("Arrives the same business day."),
      ).toBeInTheDocument();

      await chooseRecipient(user, "Pilot.com, Inc.");
      expect(screen.getByRole("radio", { name: "ACH · free" })).toBeChecked();
      expect(
        screen.getByText("Arrives in 1 to 2 business days."),
      ).toBeInTheDocument();
    });

    it("opens on a given recipient with their default method", () => {
      setup({ initialRecipientId: ids.recipientGunderson });

      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Gunderson Dettmer LLP");
      expect(screen.getByRole("radio", { name: "Wire · $15" })).toBeChecked();
    });

    it("ignores an initial recipient that is not in the list", () => {
      setup({ initialRecipientId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9" });

      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Choose a recipient");
      expect(screen.getByRole("radio", { name: "ACH · free" })).toBeChecked();
    });

    it("keeps the method when the browser clears the recipient through the native control", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Gunderson Dettmer LLP");
      expect(screen.getByRole("radio", { name: "Wire · $15" })).toBeChecked();

      // Radix mirrors the picker into an aria-hidden <select> so that browser
      // autofill and form restoration can write to it. Clearing it is the one
      // way the picker can report a value that matches no recipient.
      const native = screen
        .getAllByRole("combobox", { hidden: true })
        .filter((element) => element instanceof HTMLSelectElement)
        .find((select) =>
          Array.from(select.options).some(
            (option) => option.value === ids.recipientGunderson,
          ),
        );
      expect(native).toBeDefined();
      fireEvent.change(native!, { target: { value: "" } });

      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Choose a recipient");
      expect(screen.getByRole("radio", { name: "Wire · $15" })).toBeChecked();
      await review(user);
      expect(
        await screen.findByRole("combobox", { name: "Recipient" }),
      ).toHaveAccessibleDescription("Choose a recipient");
    });

    it("rejects an amount above the available balance without calling the API", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Pilot.com, Inc.");
      await enterAmount(user, "250,000.01");

      await review(user);

      const amount = screen.getByRole("textbox", { name: "Amount" });
      await waitFor(() =>
        expect(amount).toHaveAccessibleDescription(
          "Exceeds the available balance of $250,000.00",
        ),
      );
      expect(amount).toBeInvalid();
      expect(
        screen.getByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("allows paying out the whole balance by ACH", async () => {
      const { user } = setup();

      await reviewPaymentToPilot(user, "250,000");

      expect(summaryRows()).toMatchObject({ Total: "$250,000.00" });
    });

    it("counts the wire fee against the balance", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Pilot.com, Inc.");
      await enterAmount(user, "249,990");
      await user.click(screen.getByRole("radio", { name: "Wire · $15" }));

      await review(user);
      await waitFor(() =>
        expect(
          screen.getByRole("textbox", { name: "Amount" }),
        ).toHaveAccessibleDescription(
          "Exceeds the available balance of $250,000.00",
        ),
      );

      // The same amount fits once the $15 fee is gone.
      await user.click(screen.getByRole("radio", { name: "ACH · free" }));
      await review(user);

      expect(
        await screen.findByRole("dialog", { name: "Review payment" }),
      ).toBeInTheDocument();
      expect(summaryRows()).toMatchObject({
        Method: "ACH",
        Total: "$249,990.00",
      });
    });

    it("checks the balance of whichever account is paying", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("combobox", { name: "From" }));
      await user.click(screen.getByRole("option", { name: /Treasury/ }));

      // More than Operating Checking holds, well within Treasury's $900,000.
      await reviewPaymentToPilot(user, "300,000");

      expect(summaryRows()).toMatchObject({
        From: "Treasury",
        Total: "$300,000.00",
      });
    });

    it("closes from Cancel", async () => {
      const { onClose, user } = setup();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on Escape", async () => {
      const { onClose, user } = setup();

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("review step", () => {
    it("summarizes a free ACH payment sent today", async () => {
      const { user } = setup();

      await reviewPaymentToPilot(user);

      expect(summaryRows()).toEqual({
        To: "Pilot.com, Inc.Silicon Valley Bank ••4406",
        From: "Operating Checking",
        Method: "ACH",
        "Send on": "Today",
        Amount: "$500.00",
        Total: "$500.00",
      });
      expect(
        screen.getByRole("button", { name: "Send $500.00" }),
      ).toBeEnabled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("adds the $15 wire fee to the total and shows the memo", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Gunderson Dettmer LLP");
      await enterAmount(user, "1,000");
      await user.type(screen.getByLabelText("Memo"), "Invoice 2291");

      await review(user);
      await screen.findByRole("dialog", { name: "Review payment" });

      expect(summaryRows()).toEqual({
        To: "Gunderson Dettmer LLPFirst Republic ••7715",
        From: "Operating Checking",
        Method: "Wire",
        "Send on": "Today",
        Memo: "Invoice 2291",
        Amount: "$1,000.00",
        "Wire fee": "$15.00",
        Total: "$1,015.00",
      });
      expect(
        screen.getByRole("button", { name: "Send $1,015.00" }),
      ).toBeInTheDocument();
    });

    it("offers to schedule when a send date is set, and shows the fee it will charge", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Gunderson Dettmer LLP");
      await enterAmount(user, "1,000");
      await user.type(screen.getByLabelText("Send on"), "2026-07-01");

      await review(user);
      await screen.findByRole("dialog", { name: "Review payment" });

      expect(summaryRows()).toEqual({
        To: "Gunderson Dettmer LLPFirst Republic ••7715",
        From: "Operating Checking",
        Method: "Wire",
        "Send on": "Jul 1, 2026",
        Amount: "$1,000.00",
        "Wire fee": "$15.00",
        Total: "$1,015.00",
      });
      expect(
        screen.getByText(
          "Check the details. Money leaves your account on the date you chose.",
        ),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Schedule payment" }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: /^Send/ }),
      ).not.toBeInTheDocument();
    });

    it("does not hold a scheduled payment to today's balance", async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText("Send on"), "2026-07-01");

      await reviewPaymentToPilot(user, "400,000");

      expect(summaryRows()).toMatchObject({
        "Send on": "Jul 1, 2026",
        Total: "$400,000.00",
      });
    });

    it("goes back to the form with everything still filled in", async () => {
      const { user } = setup();
      await chooseRecipient(user, "Gunderson Dettmer LLP");
      await enterAmount(user, "1250.5");
      await user.type(screen.getByLabelText("Send on"), "2026-07-01");
      await user.type(screen.getByLabelText("Memo"), "Retainer");
      await review(user);
      await screen.findByRole("dialog", { name: "Review payment" });

      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(
        screen.getByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Gunderson Dettmer LLP");
      expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue(
        "1,250.50",
      );
      expect(screen.getByRole("radio", { name: "Wire · $15" })).toBeChecked();
      expect(screen.getByLabelText("Send on")).toHaveValue("2026-07-01");
      expect(screen.getByLabelText("Memo")).toHaveValue("Retainer");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("sending", () => {
    it("posts the payment once, with an idempotency key, and confirms it", async () => {
      const { onClose, queryClient, user } = setup();
      let respond!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      );
      await reviewPaymentToPilot(user);

      await user.click(screen.getByRole("button", { name: "Send $500.00" }));

      // While the request is in flight neither button can be used.
      expect(
        await screen.findByRole("button", { name: "Sending…" }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

      respond(jsonResponse(sentResult, 201));

      const status = await screen.findByRole("status");
      expect(within(status).getByText("Payment sent")).toBeInTheDocument();
      expect(
        within(status).getByText(
          "$500.00 to Pilot.com, Inc. is on its way. Reference ALD-PAY00001.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("dialog", { name: "Payment sent" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "View transaction" }),
      ).toHaveAttribute("href", `/transactions?tx=${PAYMENT_ID}`);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const request = requestAt(0);
      expect(request.url).toBe("/api/payments");
      expect(request.method).toBe("POST");
      expect(request.headers["Content-Type"]).toBe("application/json");
      expect(request.headers["Idempotency-Key"]).toMatch(UUID);
      expect(request.body).toEqual({
        fromAccountId: ids.checking,
        recipientId: ids.recipientPilot,
        amountCents: 500_00,
        method: "ach",
        memo: "",
      });

      // Balances and lists elsewhere in the app are now stale.
      await waitFor(() =>
        expect(
          queryClient.getQueryState(queryKeys.accounts)?.isInvalidated,
        ).toBe(true),
      );

      await user.click(screen.getByRole("button", { name: "Done" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("sends the method, memo and date that were reviewed, and confirms a scheduled payment", async () => {
      const { user } = setup();
      const scheduled: TransactionDto = {
        ...sentPayment,
        description: "Gunderson Dettmer LLP",
        amountCents: -1_000_00,
        method: "wire",
        status: "scheduled",
        postedAt: "2026-07-01T00:00:00.000Z",
        reference: "ALD-SCHED001",
      };
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ payment: scheduled, fee: null }, 201),
      );
      await chooseRecipient(user, "Gunderson Dettmer LLP");
      await enterAmount(user, "1,000");
      await user.type(screen.getByLabelText("Send on"), "2026-07-01");
      await user.type(screen.getByLabelText("Memo"), "  Retainer  ");
      await review(user);

      await user.click(
        await screen.findByRole("button", { name: "Schedule payment" }),
      );

      const status = await screen.findByRole("status");
      expect(within(status).getByText("Payment scheduled")).toBeInTheDocument();
      expect(
        within(status).getByText(
          "$1,000.00 to Gunderson Dettmer LLP will go out on Jul 1, 2026. Reference ALD-SCHED001.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("dialog", { name: "Payment scheduled" }),
      ).toBeInTheDocument();
      expect(requestAt(0).body).toEqual({
        fromAccountId: ids.checking,
        recipientId: ids.recipientGunderson,
        amountCents: 1_000_00,
        method: "wire",
        memo: "Retainer",
        scheduledFor: "2026-07-01",
      });
    });

    it("returns to the form with the server's message on the field at fault", async () => {
      const { user } = setup();
      fetchMock
        .mockResolvedValueOnce(
          errorResponse(422, "insufficient_funds", "Insufficient funds.", {
            amountCents: "Operating Checking has only $120.00 available",
          }),
        )
        .mockResolvedValueOnce(jsonResponse(sentResult, 201));
      await reviewPaymentToPilot(user);

      await user.click(screen.getByRole("button", { name: "Send $500.00" }));

      expect(
        await screen.findByRole("dialog", { name: "Send money" }),
      ).toBeInTheDocument();
      const amount = screen.getByRole("textbox", { name: "Amount" });
      expect(amount).toBeInvalid();
      expect(amount).toHaveAccessibleDescription(
        "Operating Checking has only $120.00 available",
      );
      expect(amount).toHaveValue("500.00");
      expect(
        screen.getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Pilot.com, Inc.");

      // A corrected payment is a new payment: it must not reuse the old key.
      await enterAmount(user, "100");
      await review(user);
      const dialog = await screen.findByRole("dialog", {
        name: "Review payment",
      });
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Send $100.00" }));

      await screen.findByRole("status");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(requestAt(1).body).toMatchObject({ amountCents: 100_00 });
      expect(requestAt(1).headers["Idempotency-Key"]).toMatch(UUID);
      expect(requestAt(1).headers["Idempotency-Key"]).not.toBe(
        requestAt(0).headers["Idempotency-Key"],
      );
    });

    it("keeps the review open on a general server error, and retries with the same key", async () => {
      const { user } = setup();
      fetchMock
        .mockResolvedValueOnce(
          errorResponse(500, "internal_error", "The bank did not respond."),
        )
        .mockResolvedValueOnce(jsonResponse(sentResult, 201));
      await reviewPaymentToPilot(user);

      await user.click(screen.getByRole("button", { name: "Send $500.00" }));

      const dialog = screen.getByRole("dialog", { name: "Review payment" });
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "The bank did not respond.",
      );
      const retry = screen.getByRole("button", { name: "Send $500.00" });
      expect(retry).toBeEnabled();

      await user.click(retry);

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Payment sent",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(requestAt(1).body).toEqual(requestAt(0).body);
      expect(requestAt(1).headers["Idempotency-Key"]).toBe(
        requestAt(0).headers["Idempotency-Key"],
      );
    });

    it("shows a generic message when the request fails in an unexpected way", async () => {
      const { user } = setup();
      fetchMock.mockRejectedValueOnce(
        new DOMException("The operation was aborted.", "AbortError"),
      );
      await reviewPaymentToPilot(user);

      await user.click(screen.getByRole("button", { name: "Send $500.00" }));

      const dialog = screen.getByRole("dialog", { name: "Review payment" });
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Something went wrong. Please try again.",
      );
    });

    it("clears a previous failure when the payment is reviewed again", async () => {
      const { user } = setup();
      fetchMock.mockResolvedValueOnce(
        errorResponse(500, "internal_error", "The bank did not respond."),
      );
      await reviewPaymentToPilot(user);
      await user.click(screen.getByRole("button", { name: "Send $500.00" }));
      const failed = screen.getByRole("dialog", { name: "Review payment" });
      await within(failed).findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Back" }));
      await review(user);

      const dialog = await screen.findByRole("dialog", {
        name: "Review payment",
      });
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
