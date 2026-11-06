import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransferResultDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { accounts, ids, transactions } from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { TransferDialog } from "./transfer-dialog";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const transferResult: TransferResultDto = {
  debit: {
    ...transactions.transfer,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    accountId: ids.checking,
    accountName: "Operating Checking",
    description: "Transfer to Savings Reserve",
    amountCents: -500_00,
    counterpartyAccountName: "Savings Reserve",
  },
  credit: {
    ...transactions.transfer,
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    accountId: ids.savings,
    accountName: "Savings Reserve",
    description: "Transfer from Operating Checking",
    amountCents: 500_00,
    counterpartyAccountName: "Operating Checking",
  },
};

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

function setup(props: Partial<Parameters<typeof TransferDialog>[0]> = {}) {
  const onClose = vi.fn();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.accounts, accounts);
  const ui = (open: boolean) => (
    <TransferDialog
      open={open}
      onClose={onClose}
      accounts={accounts}
      {...props}
    />
  );
  const view = renderWithProviders(ui(props.open ?? true), { queryClient });
  return {
    onClose,
    queryClient,
    user: userEvent.setup(),
    /** Closes or reopens the dialog, as the page does when the URL changes. */
    setOpen: (open: boolean) => view.rerender(ui(open)),
  };
}

async function chooseAccount(
  user: UserEvent,
  field: "From" | "To",
  account: RegExp,
) {
  await user.click(screen.getByRole("combobox", { name: field }));
  await user.click(screen.getByRole("option", { name: account }));
}

async function enterAmount(user: UserEvent, amount: string) {
  const field = screen.getByRole("textbox", { name: "Amount" });
  await user.clear(field);
  await user.type(field, amount);
}

const submit = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Transfer" }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("TransferDialog", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts from the first account to the second", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Transfer between accounts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "From" })).toHaveTextContent(
      "Operating Checking",
    );
    expect(screen.getByRole("combobox", { name: "To" })).toHaveTextContent(
      "Savings Reserve",
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    expect(screen.getByLabelText("Memo")).toHaveAccessibleDescription(
      "Optional.",
    );
  });

  it("asks for an amount when submitted empty", async () => {
    const { user } = setup();

    await submit(user);

    const amount = screen.getByRole("textbox", { name: "Amount" });
    await waitFor(() =>
      expect(amount).toHaveAccessibleDescription("Enter an amount"),
    );
    expect(amount).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an amount it cannot read, or one that is zero", async () => {
    const { user } = setup();
    const amount = screen.getByRole("textbox", { name: "Amount" });

    // Three decimals is not an amount of money: refused rather than rounded.
    await enterAmount(user, "12.345");
    await submit(user);
    await waitFor(() =>
      expect(amount).toHaveAccessibleDescription("Enter an amount"),
    );

    await enterAmount(user, "0");
    await submit(user);
    await waitFor(() =>
      expect(amount).toHaveAccessibleDescription(
        "Enter an amount greater than zero",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for both accounts when there are none", async () => {
    const { user } = setup({ accounts: [] });

    await submit(user);

    expect(
      await screen.findByRole("combobox", { name: "From" }),
    ).toHaveAccessibleDescription("Choose an account");
    expect(
      screen.getByRole("combobox", { name: "To" }),
    ).toHaveAccessibleDescription("Choose an account");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a destination when there is only one account", async () => {
    const { user } = setup({ accounts: [accounts[0]] });

    expect(screen.getByRole("combobox", { name: "To" })).toHaveTextContent(
      "Choose an account",
    );
    await enterAmount(user, "500");
    await submit(user);

    const to = screen.getByRole("combobox", { name: "To" });
    await waitFor(() =>
      expect(to).toHaveAccessibleDescription("Choose an account"),
    );
    expect(screen.getByRole("combobox", { name: "From" })).toBeValid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to transfer an account into itself", async () => {
    const { user } = setup();
    await chooseAccount(user, "To", /Operating Checking/);
    await enterAmount(user, "500");

    await submit(user);

    const to = screen.getByRole("combobox", { name: "To" });
    await waitFor(() =>
      expect(to).toHaveAccessibleDescription("Choose two different accounts"),
    );
    expect(to).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an amount above the source account's balance without calling the API", async () => {
    const { user } = setup();
    await enterAmount(user, "250,000.01");

    await submit(user);

    const amount = screen.getByRole("textbox", { name: "Amount" });
    await waitFor(() =>
      expect(amount).toHaveAccessibleDescription(
        "Exceeds the available balance of $250,000.00",
      ),
    );
    expect(amount).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the balance of the chosen source account and can empty it", async () => {
    const { user } = setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(transferResult, 201));
    await chooseAccount(user, "From", /Treasury/);
    await chooseAccount(user, "To", /Operating Checking/);
    // All of Treasury: more than the default source account holds.
    await enterAmount(user, "900,000");

    await submit(user);

    await screen.findByRole("status");
    expect(requestAt(0).body).toEqual({
      fromAccountId: ids.treasury,
      toAccountId: ids.checking,
      amountCents: 900_000_00,
      memo: "",
    });
  });

  it("posts the transfer with an idempotency key and confirms it", async () => {
    const { onClose, queryClient, user } = setup();
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    await enterAmount(user, "500");
    await user.type(screen.getByLabelText("Memo"), "  Top up reserve ");

    await submit(user);

    // No second transfer can be started while the first is in flight.
    expect(
      await screen.findByRole("button", { name: "Transferring…" }),
    ).toBeDisabled();

    respond(jsonResponse(transferResult, 201));

    const status = await screen.findByRole("status");
    expect(within(status).getByText("Transfer complete")).toBeInTheDocument();
    expect(
      within(status).getByText(
        "$500.00 moved from Operating Checking to Savings Reserve. Both balances are already updated.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Transfer complete" }),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = requestAt(0);
    expect(request.url).toBe("/api/transfers");
    expect(request.method).toBe("POST");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers["Idempotency-Key"]).toMatch(UUID);
    expect(request.body).toEqual({
      fromAccountId: ids.checking,
      toAccountId: ids.savings,
      amountCents: 500_00,
      memo: "Top up reserve",
    });

    // Balances and lists elsewhere in the app are now stale.
    await waitFor(() =>
      expect(queryClient.getQueryState(queryKeys.accounts)?.isInvalidated).toBe(
        true,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts a server field error on the field, with no separate alert", async () => {
    const { user } = setup();
    fetchMock.mockResolvedValueOnce(
      errorResponse(422, "insufficient_funds", "Insufficient funds.", {
        amountCents: "Operating Checking has only $120.00 available",
      }),
    );
    await enterAmount(user, "500");

    await submit(user);

    const amount = screen.getByRole("textbox", { name: "Amount" });
    await waitFor(() =>
      expect(amount).toHaveAccessibleDescription(
        "Operating Checking has only $120.00 available",
      ),
    );
    expect(amount).toBeInvalid();
    expect(
      screen.getAllByRole("alert").map((alert) => alert.textContent),
    ).toEqual(["Operating Checking has only $120.00 available"]);
    expect(screen.getByRole("button", { name: "Transfer" })).toBeEnabled();
  });

  it("shows a general server error and retries with the same idempotency key", async () => {
    const { user } = setup();
    fetchMock
      .mockResolvedValueOnce(
        errorResponse(500, "internal_error", "The ledger is unavailable."),
      )
      .mockResolvedValueOnce(jsonResponse(transferResult, 201));
    await enterAmount(user, "500");

    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The ledger is unavailable.",
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeValid();
    expect(
      screen.getByRole("dialog", { name: "Transfer between accounts" }),
    ).toBeInTheDocument();

    await submit(user);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Transfer complete",
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
    await enterAmount(user, "500");

    await submit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
  });

  it("uses a new idempotency key each time the dialog is opened", async () => {
    const { setOpen, user } = setup();
    fetchMock.mockImplementation(async () => jsonResponse(transferResult, 201));
    await enterAmount(user, "500");
    await submit(user);
    await screen.findByRole("status");

    setOpen(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    setOpen(true);

    // A clean form again, and a transfer the server must not deduplicate.
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    await enterAmount(user, "500");
    await submit(user);
    await screen.findByRole("status");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestAt(1).headers["Idempotency-Key"]).toMatch(UUID);
    expect(requestAt(1).headers["Idempotency-Key"]).not.toBe(
      requestAt(0).headers["Idempotency-Key"],
    );
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
