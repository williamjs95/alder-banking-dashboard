import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipientDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { recipients } from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { AddRecipientDialog } from "./add-recipient-dialog";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const created: RecipientDto = {
  id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
  name: "Acme Supplies",
  email: "ap@acme.example",
  bankName: "Chase",
  accountLast4: "6789",
  defaultMethod: "wire",
  createdAt: "2026-06-18T12:00:00.000Z",
};

const fetchMock = vi.fn<typeof fetch>();

function lastRequest() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return {
    url,
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

function setup(props: Partial<Parameters<typeof AddRecipientDialog>[0]> = {}) {
  const onClose = vi.fn();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.recipients, recipients);
  renderWithProviders(
    <AddRecipientDialog open onClose={onClose} {...props} />,
    {
      queryClient,
    },
  );
  return { onClose, queryClient, user: userEvent.setup() };
}

const field = (name: string) => screen.getByRole("textbox", { name });

/** Types valid bank details for Acme Supplies; the email is left empty. */
async function fillRequired(user: UserEvent) {
  await user.type(field("Name"), "Acme Supplies");
  await user.type(field("Bank"), "Chase");
  await user.type(field("Routing number"), "021000021");
  await user.type(field("Account number"), "123456789");
}

const submit = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Add recipient" }));

beforeEach(() => {
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("AddRecipientDialog", () => {
  it("renders nothing while closed", () => {
    setup({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("starts empty with ACH as the default method", () => {
    setup();

    expect(
      screen.getByRole("dialog", { name: "Add recipient" }),
    ).toBeInTheDocument();
    for (const name of [
      "Name",
      "Email",
      "Bank",
      "Routing number",
      "Account number",
    ]) {
      expect(field(name)).toHaveValue("");
    }
    expect(field("Email")).toHaveAccessibleDescription(
      "Optional. Used for payment notices.",
    );
    expect(screen.getByRole("radio", { name: "ACH" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Wire" })).not.toBeChecked();
  });

  it("says what is missing when submitted empty, and leaves the optional email alone", async () => {
    const { user } = setup();

    await submit(user);

    await waitFor(() =>
      expect(field("Name")).toHaveAccessibleDescription(
        "Enter the recipient's name",
      ),
    );
    expect(field("Bank")).toHaveAccessibleDescription("Enter the bank name");
    expect(field("Routing number")).toHaveAccessibleDescription(
      "Routing numbers have 9 digits",
    );
    expect(field("Account number")).toHaveAccessibleDescription(
      "Account numbers have 6 to 17 digits",
    );
    for (const name of ["Name", "Bank", "Routing number", "Account number"]) {
      expect(field(name)).toBeInvalid();
    }
    expect(field("Email")).toBeValid();
    expect(screen.getAllByRole("alert")).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email and bank numbers of the wrong shape", async () => {
    const { user } = setup();
    await user.type(field("Name"), "Acme Supplies");
    await user.type(field("Email"), "not-an-email");
    await user.type(field("Bank"), "Chase");
    await user.type(field("Routing number"), "12345678");
    await user.type(field("Account number"), "12AB56");

    await submit(user);

    await waitFor(() =>
      expect(field("Email")).toHaveAccessibleDescription("Enter a valid email"),
    );
    expect(field("Routing number")).toHaveAccessibleDescription(
      "Routing numbers have 9 digits",
    );
    expect(field("Account number")).toHaveAccessibleDescription(
      "Account numbers have 6 to 17 digits",
    );
    expect(field("Name")).toBeValid();
    expect(field("Bank")).toBeValid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the recipient, announces it and closes", async () => {
    const onCreated = vi.fn();
    const { onClose, queryClient, user } = setup({ onCreated });
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    await fillRequired(user);
    await user.type(field("Email"), "ap@acme.example");
    await user.click(screen.getByRole("radio", { name: "Wire" }));
    expect(screen.getByRole("radio", { name: "Wire" })).toBeChecked();

    await submit(user);

    expect(
      await screen.findByRole("button", { name: "Adding…" }),
    ).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    respond(jsonResponse(created, 201));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Acme Supplies added",
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(created);
    // The list of recipients behind the dialog must refetch.
    expect(queryClient.getQueryState(queryKeys.recipients)?.isInvalidated).toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = lastRequest();
    expect(request.url).toBe("/api/recipients");
    expect(request.method).toBe("POST");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.body).toEqual({
      name: "Acme Supplies",
      email: "ap@acme.example",
      bankName: "Chase",
      routingNumber: "021000021",
      accountNumber: "123456789",
      defaultMethod: "wire",
    });
  });

  it("trims what was typed and leaves an empty email out of the request", async () => {
    const { onClose, user } = setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...created, email: null, defaultMethod: "ach" }, 201),
    );
    await user.type(field("Name"), "  Acme Supplies ");
    await user.type(field("Bank"), " Chase  ");
    await user.type(field("Routing number"), " 021000021 ");
    await user.type(field("Account number"), " 123456789 ");

    await submit(user);

    // No `onCreated` was given: adding still succeeds and closes.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Acme Supplies added",
    );
    expect(lastRequest().body).toEqual({
      name: "Acme Supplies",
      bankName: "Chase",
      routingNumber: "021000021",
      accountNumber: "123456789",
      defaultMethod: "ach",
    });
  });

  it("puts a server field error on the field and keeps the dialog open", async () => {
    const onCreated = vi.fn();
    const { onClose, user } = setup({ onCreated });
    fetchMock.mockResolvedValueOnce(
      errorResponse(422, "validation_error", "Check the highlighted fields.", {
        routingNumber: "That routing number does not belong to a US bank",
      }),
    );
    await fillRequired(user);

    await submit(user);

    await waitFor(() =>
      expect(field("Routing number")).toHaveAccessibleDescription(
        "That routing number does not belong to a US bank",
      ),
    );
    expect(field("Routing number")).toBeInvalid();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Check the highlighted fields.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // What was typed is still there to correct.
    expect(field("Name")).toHaveValue("Acme Supplies");
    expect(screen.getByRole("button", { name: "Add recipient" })).toBeEnabled();
  });

  it("reports a general server error without blaming a field", async () => {
    const { onClose, user } = setup();
    fetchMock.mockResolvedValueOnce(
      errorResponse(500, "internal_error", "Recipients are unavailable."),
    );
    await fillRequired(user);

    await submit(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "Recipients are unavailable.",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Add recipient" }),
    ).toBeInTheDocument();
  });

  it("reports a generic message when the request fails in an unexpected way", async () => {
    const { onClose, user } = setup();
    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    await fillRequired(user);

    await submit(user);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "Something went wrong. Please try again.",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from Cancel without creating anything", async () => {
    const { onClose, user } = setup();
    await fillRequired(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const { onClose, user } = setup();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
