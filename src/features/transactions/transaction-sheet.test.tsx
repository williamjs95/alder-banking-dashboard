import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { ids, transactionList, transactions } from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { timelineFor, TransactionSheet } from "./transaction-sheet";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

/** A promise settled by the test, for holding a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** A one-transaction API: GET returns it, PATCH merges the body into it. */
function serve(initial: TransactionDto) {
  let current = initial;
  fetchMock.mockImplementation(async (_input, init) => {
    if (init?.method === "PATCH") {
      current = { ...current, ...JSON.parse(String(init.body)) };
    }
    return jsonResponse(current);
  });
}

/** Every request of `method` made so far, as `[url, parsed body]`. */
const requests = (method: "GET" | "PATCH") =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([url, init]) => [
      url,
      init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    ]);

/**
 * Renders the sheet for `transaction`, already in the cache as it is after the
 * detail request, with an API behind it that accepts edits.
 */
function setupOpen(transaction: TransactionDto) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.transaction(transaction.id), transaction);
  serve(transaction);
  const onClose = vi.fn();
  const view = renderWithProviders(
    <TransactionSheet id={transaction.id} onClose={onClose} />,
    { queryClient },
  );
  const open = (next: TransactionDto) => {
    queryClient.setQueryData(queryKeys.transaction(next.id), next);
    view.rerender(<TransactionSheet id={next.id} onClose={onClose} />);
  };
  return { queryClient, onClose, open, user: userEvent.setup() };
}

/** The value beside `label` in the details list. */
const detail = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling;
const hasDetail = (label: string) =>
  screen.queryByText(label, { selector: "dt" }) !== null;

const noteField = () => screen.getByRole("textbox", { name: "Note" });
const saveButton = () => screen.getByRole("button", { name: "Save note" });

describe("timelineFor", () => {
  it("marks every step done for a posted transaction", () => {
    expect(timelineFor("posted")).toEqual([
      { label: "Initiated", state: "done" },
      { label: "Processing", state: "done" },
      { label: "Posted", state: "done" },
    ]);
  });

  it("puts a pending transaction at the processing step", () => {
    expect(timelineFor("pending")).toEqual([
      { label: "Initiated", state: "done" },
      { label: "Processing", state: "current" },
      { label: "Posted", state: "todo" },
    ]);
  });

  it("starts a scheduled transaction at its own first step", () => {
    expect(timelineFor("scheduled")).toEqual([
      { label: "Scheduled", state: "current" },
      { label: "Processing", state: "todo" },
      { label: "Posted", state: "todo" },
    ]);
  });

  it("ends a failed transaction at “Returned”, with no posted step", () => {
    expect(timelineFor("failed")).toEqual([
      { label: "Initiated", state: "done" },
      { label: "Returned", state: "failed" },
    ]);
  });
});

describe("TransactionSheet", () => {
  describe("opening", () => {
    it("stays closed and requests nothing while no transaction is selected", () => {
      renderWithProviders(<TransactionSheet id={null} onClose={vi.fn()} />);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows a loading state, then the transaction it fetched", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      renderWithProviders(
        <TransactionSheet id={ids.txStripe} onClose={vi.fn()} />,
      );

      const dialog = screen.getByRole("dialog", { name: "Loading…" });
      expect(dialog.querySelector("[aria-busy='true']")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        `/api/transactions/${ids.txStripe}`,
        expect.objectContaining({ method: "GET" }),
      );

      response.resolve(jsonResponse(transactions.stripe));

      expect(
        await screen.findByRole("dialog", { name: "Stripe" }),
      ).toBeVisible();
      expect(
        dialog.querySelector("[aria-busy='true']"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("+$11,048.20")).toBeVisible();
    });

    it("replaces the note from the list row when the fetched detail has a newer one", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      renderWithProviders(
        <TransactionSheet
          id={ids.txAws}
          seed={transactions.aws}
          onClose={vi.fn()}
        />,
      );
      expect(noteField()).toHaveValue("June invoice");

      // A teammate edited the note after the list was loaded.
      response.resolve(
        jsonResponse({ ...transactions.aws, note: "June invoice, approved" }),
      );

      await waitFor(() =>
        expect(noteField()).toHaveValue("June invoice, approved"),
      );
      // Nothing was typed, so there is nothing to save.
      expect(saveButton()).toBeDisabled();
    });

    it("shows the row from the list at once, then the fetched detail", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      renderWithProviders(
        <TransactionSheet
          id={ids.txAws}
          seed={transactions.aws}
          onClose={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("dialog", { name: "Amazon Web Services" }),
      ).toBeVisible();
      expect(detail("Reference")).toHaveTextContent("ALD-AWS00001");
      expect(screen.getByText("Pending")).toBeVisible();
      expect(requests("GET")).toEqual([
        [`/api/transactions/${ids.txAws}`, undefined],
      ]);

      // The payment settled since the list was loaded.
      response.resolve(jsonResponse({ ...transactions.aws, status: "posted" }));

      await waitFor(() =>
        expect(screen.queryByText("Pending")).not.toBeInTheDocument(),
      );
      expect(
        within(
          screen.getByRole("list", { name: "Payment progress" }),
        ).getByText("Posted"),
      ).toBeVisible();
    });

    it("explains the failure when the transaction cannot be loaded", async () => {
      fetchMock.mockResolvedValue(
        errorResponse(404, "not_found", "Transaction not found"),
      );
      renderWithProviders(
        <TransactionSheet id={ids.txStripe} onClose={vi.fn()} />,
      );

      expect(
        await screen.findByRole("dialog", { name: "Transaction unavailable" }),
      ).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Transaction not found",
      );
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("does not refetch a transaction that is already fresh in the cache", () => {
      setupOpen(transactions.stripe);

      expect(screen.getByRole("dialog", { name: "Stripe" })).toBeVisible();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("details", () => {
    it("shows a card payment in full", () => {
      setupOpen(transactions.aws);

      expect(screen.getByText("-$15,137.39")).toBeVisible();
      expect(detail("Date")).toHaveTextContent("Jun 3, 2026, 10:12 AM UTC");
      expect(detail("Account")).toHaveTextContent("Operating Checking");
      expect(detail("Method")).toHaveTextContent("Card");
      expect(detail("Card")).toHaveTextContent("Cloud infrastructure ••4417");
      expect(detail("Reference")).toHaveTextContent("ALD-AWS00001");
      expect(
        screen.getByRole("combobox", { name: "Category" }),
      ).toHaveTextContent("Cloud & infrastructure");
      expect(noteField()).toHaveValue("June invoice");
    });

    it("leaves out the card and counterparty rows when there are none", () => {
      setupOpen(transactions.stripe);

      expect(screen.getByText("+$11,048.20")).toBeVisible();
      expect(detail("Method")).toHaveTextContent("ACH");
      expect(hasDetail("Card")).toBe(false);
      expect(hasDetail("To")).toBe(false);
      expect(hasDetail("From")).toBe(false);
      expect(noteField()).toHaveValue("");
    });

    it("names the account money went to on the debit side of a transfer", () => {
      setupOpen(transactions.transfer);

      expect(detail("Account")).toHaveTextContent("Treasury");
      expect(detail("To")).toHaveTextContent("Operating Checking");
      expect(hasDetail("From")).toBe(false);
    });

    it("names the account money came from on the credit side of a transfer", () => {
      setupOpen({
        ...transactions.transfer,
        accountId: ids.checking,
        accountName: "Operating Checking",
        description: "Transfer from Treasury",
        amountCents: 60_000_00,
        counterpartyAccountName: "Treasury",
      });

      expect(detail("Account")).toHaveTextContent("Operating Checking");
      expect(detail("From")).toHaveTextContent("Treasury");
      expect(hasDetail("To")).toBe(false);
    });

    it("copies the reference to the clipboard", async () => {
      const { user } = setupOpen(transactions.aws);

      await user.click(screen.getByRole("button", { name: "Copy reference" }));

      expect(await navigator.clipboard.readText()).toBe("ALD-AWS00001");
      expect(
        screen.getByRole("button", { name: "reference copied" }),
      ).toBeVisible();
    });
  });

  describe("payment progress", () => {
    const steps = () =>
      within(
        screen.getByRole("list", { name: "Payment progress" }),
      ).getAllByRole("listitem");
    const currentStep = () =>
      screen
        .getByRole("list", { name: "Payment progress" })
        .querySelector("[aria-current='step']");

    it("shows a posted transaction as complete, with no step in progress", () => {
      setupOpen(transactions.stripe);

      expect(steps().map((step) => step.textContent)).toEqual([
        "Initiated",
        "Processing",
        "Posted",
      ]);
      expect(currentStep()).not.toBeInTheDocument();
    });

    it("marks “Processing” as the current step of a pending transaction", () => {
      setupOpen(transactions.aws);

      expect(steps().map((step) => step.textContent)).toEqual([
        "Initiated",
        "Processing",
        "Posted",
      ]);
      expect(currentStep()).toHaveTextContent("Processing");
    });

    it("marks “Scheduled” as the current step of a scheduled payment", () => {
      setupOpen(transactions.scheduled);

      expect(steps().map((step) => step.textContent)).toEqual([
        "Scheduled",
        "Processing",
        "Posted",
      ]);
      expect(currentStep()).toHaveTextContent("Scheduled");
    });

    it("ends a failed payment at “Returned”", () => {
      setupOpen(transactions.failed);

      expect(steps().map((step) => step.textContent)).toEqual([
        "Initiated",
        "Returned",
      ]);
      expect(currentStep()).not.toBeInTheDocument();
      expect(screen.getByText("Failed")).toBeVisible();
    });
  });

  describe("category", () => {
    it("offers only the categories a person may assign", async () => {
      const { user } = setupOpen(transactions.aws);

      await user.click(screen.getByRole("combobox", { name: "Category" }));

      const options = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(options).toHaveLength(11);
      expect(options).toContain("Software");
      expect(options).not.toContain("Internal transfer");
      expect(options).not.toContain("Interest");
    });

    it("saves a new category and refreshes everything that may show it", async () => {
      const { queryClient, user } = setupOpen(transactions.aws);
      queryClient.setQueryData(queryKeys.transactions({}), transactionList);

      await user.click(screen.getByRole("combobox", { name: "Category" }));
      await user.click(screen.getByRole("option", { name: "Software" }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledExactlyOnceWith(
          "Transaction updated",
        ),
      );
      expect(requests("PATCH")).toEqual([
        [`/api/transactions/${ids.txAws}`, { category: "software" }],
      ]);
      const [, init] = fetchMock.mock.calls[0];
      expect(new Headers(init?.headers).get("Content-Type")).toBe(
        "application/json",
      );
      expect(
        screen.getByRole("combobox", { name: "Category" }),
      ).toHaveTextContent("Software");
      expect(
        queryClient.getQueryData<TransactionDto>(
          queryKeys.transaction(ids.txAws),
        )?.category,
      ).toBe("software");
      // The list is not on screen, so it is marked stale rather than refetched.
      expect(
        queryClient.getQueryState(queryKeys.transactions({}))?.isInvalidated,
      ).toBe(true);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it.each([
      ["an internal transfer", transactions.transfer, "Internal transfer"],
      [
        "interest",
        {
          ...transactions.stripe,
          description: "Interest payment",
          category: "interest",
          method: "interest",
        } satisfies TransactionDto,
        "Interest",
      ],
    ])("is fixed text, not a choice, for %s", (_name, transaction, label) => {
      setupOpen(transaction);

      expect(detail("Category")).toHaveTextContent(label);
      expect(
        screen.queryByRole("combobox", { name: "Category" }),
      ).not.toBeInTheDocument();
    });

    it("reports a failed change and leaves the category as it was", async () => {
      const { user } = setupOpen(transactions.aws);
      fetchMock.mockResolvedValueOnce(
        errorResponse(409, "conflict", "This transaction can no longer change"),
      );

      await user.click(screen.getByRole("combobox", { name: "Category" }));
      await user.click(screen.getByRole("option", { name: "Software" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledExactlyOnceWith(
          "This transaction can no longer change",
        ),
      );
      expect(
        screen.getByRole("combobox", { name: "Category" }),
      ).toHaveTextContent("Cloud & infrastructure");
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("note", () => {
    it("counts characters as they are typed, up to 280", async () => {
      const { user } = setupOpen(transactions.stripe);

      expect(screen.getByText("0/280")).toBeVisible();
      expect(noteField()).toHaveAttribute("maxlength", "280");

      await user.type(noteField(), "Q2 payout");

      expect(screen.getByText("9/280")).toBeVisible();
    });

    it("can be saved only once it differs from the saved note", async () => {
      const { user } = setupOpen(transactions.aws);
      expect(saveButton()).toBeDisabled();

      // Surrounding whitespace is trimmed on save, so it is not a change.
      await user.type(noteField(), "  ");
      expect(saveButton()).toBeDisabled();

      await user.type(noteField(), "(paid)");
      expect(saveButton()).toBeEnabled();
    });

    it("saves the trimmed note", async () => {
      const { queryClient, user } = setupOpen(transactions.stripe);

      await user.type(noteField(), "  Q2 payout  ");
      await user.click(saveButton());

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledExactlyOnceWith(
          "Transaction updated",
        ),
      );
      expect(requests("PATCH")).toEqual([
        [`/api/transactions/${ids.txStripe}`, { note: "Q2 payout" }],
      ]);
      expect(
        queryClient.getQueryData<TransactionDto>(
          queryKeys.transaction(ids.txStripe),
        )?.note,
      ).toBe("Q2 payout");
    });

    it("removes the note when the field is emptied", async () => {
      const { user } = setupOpen(transactions.aws);

      await user.clear(noteField());
      await user.click(saveButton());

      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
      expect(requests("PATCH")).toEqual([
        [`/api/transactions/${ids.txAws}`, { note: null }],
      ]);
    });

    it("locks the form while saving and settles once the save lands", async () => {
      const { user } = setupOpen(transactions.aws);
      // Hold the PATCH in flight until the test lets the API answer it.
      const gate = deferred<void>();
      const answer = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementationOnce(async (...request) => {
        await gate.promise;
        return answer(...request);
      });

      await user.clear(noteField());
      await user.type(noteField(), "Reviewed by finance");
      await user.click(saveButton());

      const saving = screen.getByRole("button", { name: "Saving…" });
      expect(saving).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "Category" })).toBeDisabled();
      expect(toast.success).not.toHaveBeenCalled();

      gate.resolve();

      // Saved: nothing left to save until the note changes again.
      await waitFor(() => expect(saveButton()).toBeDisabled());
      expect(screen.getByRole("combobox", { name: "Category" })).toBeEnabled();
      expect(noteField()).toHaveValue("Reviewed by finance");
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    });

    it("keeps what was typed and lets it be retried when the save is rejected", async () => {
      const { user } = setupOpen(transactions.stripe);
      fetchMock.mockResolvedValueOnce(
        errorResponse(422, "validation_error", "Notes cannot contain links"),
      );

      await user.type(noteField(), "see http://example.com");
      await user.click(saveButton());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledExactlyOnceWith(
          "Notes cannot contain links",
        ),
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(noteField()).toHaveValue("see http://example.com");
      expect(saveButton()).toBeEnabled();
    });

    it("reports a network failure in plain words", async () => {
      const { user } = setupOpen(transactions.stripe);
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await user.type(noteField(), "Q2 payout");
      await user.click(saveButton());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledExactlyOnceWith(
          "Could not reach the server. Check your connection and try again.",
        ),
      );
    });

    it("starts from the next transaction's note when another one is opened", async () => {
      const { open, user } = setupOpen(transactions.aws);
      await user.type(noteField(), " — draft I never saved");

      open(transactions.failed);

      expect(
        screen.getByRole("dialog", { name: "Hartwell Staffing" }),
      ).toBeVisible();
      expect(noteField()).toHaveValue(transactions.failed.note);
      expect(saveButton()).toBeDisabled();
    });
  });

  describe("closing", () => {
    it("asks to close from the close button", async () => {
      const { onClose, user } = setupOpen(transactions.stripe);

      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("asks to close on Escape", async () => {
      const { onClose, user } = setupOpen(transactions.stripe);

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
