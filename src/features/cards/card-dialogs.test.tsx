import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/queries";
import { accounts, cards, ids } from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { EditLimitDialog, IssueCardDialog } from "./card-dialogs";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();
const cloudCard = cards[0];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

/** The single request the dialog made, decoded. */
function sentRequest() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url,
    method: init?.method,
    body: JSON.parse(String(init?.body)) as unknown,
  };
}

/** A response the test settles by hand, to observe the pending state. */
function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  fetchMock.mockReturnValueOnce(promise);
  return resolve;
}

const alerts = () =>
  screen.getAllByRole("alert").map((alert) => alert.textContent);

describe("IssueCardDialog", () => {
  function renderDialog(
    props: Partial<Parameters<typeof IssueCardDialog>[0]> = {},
  ) {
    const onClose = vi.fn();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.cards, cards);
    renderWithProviders(
      <IssueCardDialog
        open
        onClose={onClose}
        accounts={accounts}
        defaultHolder="Maya Chen"
        {...props}
      />,
      { queryClient },
    );
    return { onClose, queryClient, user: userEvent.setup() };
  }

  it("renders nothing while closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Card name")).not.toBeInTheDocument();
  });

  it("starts from the given holder, the first account and a $1,000 limit", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Issue a virtual card" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Cardholder")).toHaveValue("Maya Chen");
    expect(
      screen.getByRole("combobox", { name: "Funding account" }),
    ).toHaveTextContent("Operating Checking");
    expect(screen.getByLabelText("Monthly limit")).toHaveValue("1,000.00");
  });

  it("asks for a card name and a cardholder before sending anything", async () => {
    const { user, onClose } = renderDialog();

    await user.clear(screen.getByLabelText("Cardholder"));
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    expect(await screen.findByText("Give the card a name")).toBeInTheDocument();
    expect(alerts()).toEqual([
      "Give the card a name",
      "Enter the cardholder's name",
    ]);
    expect(screen.getByLabelText("Card name")).toBeInvalid();
    expect(screen.getByLabelText("Card name")).toHaveAccessibleDescription(
      "Give the card a name",
    );
    expect(screen.getByLabelText("Cardholder")).toBeInvalid();
    expect(screen.getByLabelText("Monthly limit")).toBeValid();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rejects a limit below $100", async () => {
    const { user } = renderDialog();

    await user.type(screen.getByLabelText("Card name"), "Conference travel");
    await user.clear(screen.getByLabelText("Monthly limit"));
    await user.type(screen.getByLabelText("Monthly limit"), "99.99");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    expect(
      await screen.findByText("The minimum limit is $100"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly limit")).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a limit above $250,000", async () => {
    const { user } = renderDialog();

    await user.type(screen.getByLabelText("Card name"), "Conference travel");
    await user.clear(screen.getByLabelText("Monthly limit"));
    await user.type(screen.getByLabelText("Monthly limit"), "250,000.01");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    expect(
      await screen.findByText("The maximum limit is $250,000"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit while the limit field is empty", async () => {
    const { user } = renderDialog();

    await user.type(screen.getByLabelText("Card name"), "Conference travel");
    await user.clear(screen.getByLabelText("Monthly limit"));
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Monthly limit")).toBeInvalid(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a funding account when there is none to default to", async () => {
    const { user } = renderDialog({ accounts: [] });

    await user.type(screen.getByLabelText("Card name"), "Conference travel");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    await waitFor(() => expect(alerts()).toEqual(["Choose an account"]));
    expect(
      screen.getByRole("combobox", { name: "Funding account" }),
    ).toBeInvalid();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues the card, confirms it and closes", async () => {
    const { user, onClose, queryClient } = renderDialog();
    const respond = pendingResponse();

    await user.type(screen.getByLabelText("Card name"), "Conference travel");
    await user.clear(screen.getByLabelText("Cardholder"));
    await user.type(screen.getByLabelText("Cardholder"), "Jordan Reyes");
    await user.click(screen.getByRole("combobox", { name: "Funding account" }));
    await user.click(screen.getByRole("option", { name: /Savings Reserve/ }));
    await user.clear(screen.getByLabelText("Monthly limit"));
    await user.type(screen.getByLabelText("Monthly limit"), "2,500");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    // In flight: the button says so and cannot be pressed twice.
    expect(
      await screen.findByRole("button", { name: "Issuing…" }),
    ).toBeDisabled();
    expect(sentRequest()).toEqual({
      url: "/api/cards",
      method: "POST",
      body: {
        label: "Conference travel",
        holderName: "Jordan Reyes",
        accountId: ids.savings,
        monthlyLimitCents: 2_500_00,
      },
    });
    expect(onClose).not.toHaveBeenCalled();

    respond(
      jsonResponse(
        {
          ...cloudCard,
          id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc9",
          label: "Conference travel",
          last4: "9001",
        },
        201,
      ),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Conference travel card issued",
      { description: "Virtual card ending in 9001 is ready to use." },
    );
    expect(toast.error).not.toHaveBeenCalled();
    // The card list is marked stale so it picks up the new card.
    expect(queryClient.getQueryState(queryKeys.cards)?.isInvalidated).toBe(
      true,
    );
  });

  it("puts the server's field errors next to the fields and stays open", async () => {
    const { user, onClose } = renderDialog();
    fetchMock.mockResolvedValueOnce(
      errorResponse(422, "validation_error", "Check the highlighted fields", {
        label: "A card with this name already exists",
      }),
    );

    await user.type(screen.getByLabelText("Card name"), "Events");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    expect(
      await screen.findByText("A card with this name already exists"),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Card name")).toBeInvalid();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Check the highlighted fields",
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Issue card" })).toBeEnabled();
  });

  it("reports a failure that is not an API error with the generic message", async () => {
    const { user, onClose } = renderDialog();
    // A 200 whose body is not JSON, as a misbehaving proxy would send.
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));

    await user.type(screen.getByLabelText("Card name"), "Events");
    await user.click(screen.getByRole("button", { name: "Issue card" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "Something went wrong. Please try again.",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from Cancel", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes with Escape", async () => {
    const { user, onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EditLimitDialog", () => {
  function renderDialog(card: typeof cloudCard | null = cloudCard) {
    const onClose = vi.fn();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.cards, cards);
    renderWithProviders(<EditLimitDialog card={card} onClose={onClose} />, {
      queryClient,
    });
    return { onClose, queryClient, user: userEvent.setup() };
  }

  const limitField = () => screen.getByLabelText("Monthly limit");
  const save = () => screen.getByRole("button", { name: "Save limit" });

  it("renders nothing without a card", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the card and starts from its current limit", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Change monthly limit" });
    expect(dialog).toHaveAccessibleDescription(
      "Cloud infrastructure ••4417. The limit resets on the 1st of each month.",
    );
    expect(limitField()).toHaveValue("25,000.00");
  });

  it("asks for a limit when the field is empty", async () => {
    const { user } = renderDialog();

    await user.clear(limitField());
    await user.click(save());

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a limit");
    expect(limitField()).toBeInvalid();
    expect(limitField()).toHaveAccessibleDescription("Enter a limit");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a limit below $100", async () => {
    const { user } = renderDialog();

    await user.clear(limitField());
    await user.type(limitField(), "50");
    await user.click(save());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The minimum limit is $100",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a limit above $250,000", async () => {
    const { user } = renderDialog();

    await user.clear(limitField());
    await user.type(limitField(), "300000");
    await user.click(save());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The maximum limit is $250,000",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the bounds themselves", async () => {
    const { user } = renderDialog();
    fetchMock.mockImplementation(async () => jsonResponse(cloudCard));

    await user.clear(limitField());
    await user.type(limitField(), "100");
    await user.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.clear(limitField());
    await user.type(limitField(), "250,000");
    await user.click(save());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(
      fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([
      { monthlyLimitCents: 100_00 },
      { monthlyLimitCents: 250_000_00 },
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves the new limit, confirms it and closes", async () => {
    const { user, onClose, queryClient } = renderDialog();
    const respond = pendingResponse();

    // A validation message from a first attempt is cleared by a valid one.
    await user.clear(limitField());
    await user.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a limit");

    await user.type(limitField(), "40,000");
    await user.click(save());

    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentRequest()).toEqual({
      url: `/api/cards/${ids.cardCloud}`,
      method: "PATCH",
      body: { monthlyLimitCents: 40_000_00 },
    });
    expect(onClose).not.toHaveBeenCalled();

    respond(jsonResponse({ ...cloudCard, monthlyLimitCents: 40_000_00 }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Monthly limit updated",
    );
    expect(queryClient.getQueryState(queryKeys.cards)?.isInvalidated).toBe(
      true,
    );
  });

  it("shows the server's message when the save fails and stays open", async () => {
    const { user, onClose } = renderDialog();
    fetchMock.mockResolvedValueOnce(
      errorResponse(
        409,
        "card_frozen",
        "Unfreeze the card to change its limit",
      ),
    );

    await user.clear(limitField());
    await user.type(limitField(), "30000");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unfreeze the card to change its limit",
    );
    expect(limitField()).toBeInvalid();
    expect(save()).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("closes from Cancel without saving", async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes with Escape", async () => {
    const { user, onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
