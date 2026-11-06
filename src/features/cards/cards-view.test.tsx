import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardDto } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { accounts, cards, ids } from "../../../test/fixtures";
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { CardsView } from "./cards-view";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/cards",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn<typeof fetch>();
const replaceState = vi.spyOn(window.history, "replaceState");
const [cloudCard, eventsCard] = cards;

beforeEach(() => {
  navigation.search = "";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  replaceState.mockClear();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function renderView(list: CardDto[] = cards) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.cards, list);
  queryClient.setQueryData(queryKeys.accounts, accounts);
  renderWithProviders(<CardsView />, { queryClient });
  return { queryClient, user: userEvent.setup() };
}

/** The list item for one card, found by the name printed on it. */
function panel(label: string) {
  const item = screen
    .getAllByRole("listitem")
    .find((candidate) => within(candidate).queryByText(label));
  if (!item) throw new Error(`No card panel labelled "${label}"`);
  return within(item);
}

const freezeSwitch = (label: string) =>
  panel(label).getByRole("switch", { name: "Freeze card" });

/**
 * Serves the card list from `current` and lets the test settle each PATCH by
 * hand, so the optimistic state can be observed while the request is in flight.
 */
function serveCards(current: { cards: CardDto[] }) {
  const patches: {
    url: string;
    body: unknown;
    respond: (response: Response) => void;
  }[] = [];
  fetchMock.mockImplementation((input, init) => {
    if (init?.method === "PATCH") {
      return new Promise<Response>((respond) => {
        patches.push({
          url: String(input),
          body: JSON.parse(String(init.body)),
          respond,
        });
      });
    }
    return Promise.resolve(jsonResponse(current.cards));
  });
  return patches;
}

const listRequests = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === "/api/cards" && init?.method === "GET",
  );

describe("CardsView", () => {
  it("summarises how many cards are active and what they spent", () => {
    renderView();

    expect(
      screen.getByText("1 active of 2 cards · $15,137 spent this month"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows each card with its spend, funding account and activity link", () => {
    renderView();

    const cloud = panel("Cloud infrastructure");
    expect(cloud.getByText("•••• •••• •••• 4417")).toBeInTheDocument();
    expect(cloud.getByText("$15,137")).toBeInTheDocument();
    expect(cloud.getByText("of $25,000")).toBeInTheDocument();
    const meter = cloud.getByRole("meter", {
      name: "$15,137 of $25,000 spent this month",
    });
    expect(meter).toHaveAttribute("aria-valuenow", "1513739");
    expect(meter).toHaveAttribute("aria-valuemax", "2500000");
    expect(
      cloud.getByText("This month · funded by Operating Checking"),
    ).toBeInTheDocument();
    expect(cloud.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      `/transactions?cardId=${ids.cardCloud}`,
    );
    expect(cloud.queryByText("Frozen")).not.toBeInTheDocument();
    expect(freezeSwitch("Cloud infrastructure")).not.toBeChecked();

    const events = panel("Events");
    expect(events.getByText("Frozen")).toBeInTheDocument();
    expect(events.getByText("$0")).toBeInTheDocument();
    expect(events.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      `/transactions?cardId=${ids.cardEvents}`,
    );
    expect(freezeSwitch("Events")).toBeChecked();
  });

  it("flags cards from 80% of their limit and at 100%", () => {
    const limit = 10_000_00;
    const at = (id: string, label: string, spentThisMonthCents: number) => ({
      ...cloudCard,
      id,
      label,
      monthlyLimitCents: limit,
      spentThisMonthCents,
    });
    renderView([
      at("cccccccc-cccc-4ccc-8ccc-cccccccccc79", "Just under", 7_999_99),
      at("cccccccc-cccc-4ccc-8ccc-cccccccccc80", "At eighty", 8_000_00),
      at("cccccccc-cccc-4ccc-8ccc-cccccccccc99", "Nearly there", 9_999_99),
      at("cccccccc-cccc-4ccc-8ccc-ccccccccc100", "Maxed out", 10_000_00),
      at("cccccccc-cccc-4ccc-8ccc-ccccccccc120", "Over the top", 12_000_00),
    ]);

    const note = (label: string) => ({
      near: panel(label).queryByText("Near limit"),
      reached: panel(label).queryByText("Limit reached"),
    });
    expect(note("Just under")).toEqual({ near: null, reached: null });
    expect(note("At eighty").near).toBeInTheDocument();
    expect(note("At eighty").reached).not.toBeInTheDocument();
    expect(note("Nearly there").near).toBeInTheDocument();
    expect(note("Nearly there").reached).not.toBeInTheDocument();
    expect(note("Maxed out").reached).toBeInTheDocument();
    expect(note("Maxed out").near).not.toBeInTheDocument();
    expect(note("Over the top").reached).toBeInTheDocument();
    expect(
      screen.getByText("5 active of 5 cards · $48,000 spent this month"),
    ).toBeInTheDocument();
  });

  it("freezes a card at once, then confirms it when the server agrees", async () => {
    const server = { cards };
    const patches = serveCards(server);
    const { user } = renderView();

    await user.click(freezeSwitch("Cloud infrastructure"));

    // Optimistic: the switch and the card face flip while the request is open.
    await waitFor(() =>
      expect(freezeSwitch("Cloud infrastructure")).toBeChecked(),
    );
    expect(
      panel("Cloud infrastructure").getByText("Frozen"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 active of 2 cards · $15,137 spent this month"),
    ).toBeInTheDocument();
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe(`/api/cards/${ids.cardCloud}`);
    expect(patches[0].body).toEqual({ status: "frozen" });
    expect(toast.success).not.toHaveBeenCalled();
    expect(listRequests()).toHaveLength(0);

    const frozen = { ...cloudCard, status: "frozen" as const };
    server.cards = [frozen, eventsCard];
    patches[0].respond(jsonResponse(frozen));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledExactlyOnceWith(
        "Cloud infrastructure frozen",
        {
          description: "New charges will be declined until you unfreeze it.",
        },
      ),
    );
    // Settled: the list is read again from the server.
    await waitFor(() => expect(listRequests()).toHaveLength(1));
    expect(freezeSwitch("Cloud infrastructure")).toBeChecked();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("unfreezes a card at once, then confirms it", async () => {
    const server = { cards };
    const patches = serveCards(server);
    const { user } = renderView();

    await user.click(freezeSwitch("Events"));

    await waitFor(() => expect(freezeSwitch("Events")).not.toBeChecked());
    expect(panel("Events").queryByText("Frozen")).not.toBeInTheDocument();
    expect(
      screen.getByText("2 active of 2 cards · $15,137 spent this month"),
    ).toBeInTheDocument();
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe(`/api/cards/${ids.cardEvents}`);
    expect(patches[0].body).toEqual({ status: "active" });

    const active = { ...eventsCard, status: "active" as const };
    server.cards = [cloudCard, active];
    patches[0].respond(jsonResponse(active));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledExactlyOnceWith(
        "Events is active again",
        { description: undefined },
      ),
    );
    await waitFor(() => expect(listRequests()).toHaveLength(1));
    expect(freezeSwitch("Events")).not.toBeChecked();
  });

  it("puts the switch back and says why when the server refuses", async () => {
    const patches = serveCards({ cards });
    const { user, queryClient } = renderView();

    await user.click(freezeSwitch("Cloud infrastructure"));
    await waitFor(() =>
      expect(freezeSwitch("Cloud infrastructure")).toBeChecked(),
    );

    patches[0].respond(
      errorResponse(409, "card_locked", "This card cannot be frozen right now"),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "This card cannot be frozen right now",
      ),
    );
    await waitFor(() =>
      expect(freezeSwitch("Cloud infrastructure")).not.toBeChecked(),
    );
    expect(
      panel("Cloud infrastructure").queryByText("Frozen"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("1 active of 2 cards · $15,137 spent this month"),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(listRequests()).toHaveLength(1));
    expect(queryClient.getQueryData(queryKeys.cards)).toEqual(cards);
  });

  it("writes ?new=card to the URL when asked to issue a card", async () => {
    const { user } = renderView();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Issue virtual card" }),
    );

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      null,
      "",
      "/cards?new=card",
    );
  });

  it("opens the issue dialog from ?new=card and clears the URL on close", async () => {
    navigation.search = "new=card";
    const { user } = renderView();

    const dialog = within(
      screen.getByRole("dialog", { name: "Issue a virtual card" }),
    );
    // Defaults to the signed-in user and the first account.
    expect(dialog.getByLabelText("Cardholder")).toHaveValue("Maya Chen");
    expect(
      dialog.getByRole("combobox", { name: "Funding account" }),
    ).toHaveTextContent("Operating Checking");

    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/cards");
  });

  it("ignores other values of ?new", () => {
    navigation.search = "new=payment";
    renderView();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the limit dialog for the chosen card and closes it again", async () => {
    const { user } = renderView();

    await user.click(
      panel("Events").getByRole("button", { name: "Edit limit" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Change monthly limit" });
    expect(dialog).toHaveAccessibleDescription(
      "Events ••1186. The limit resets on the 1st of each month.",
    );
    expect(within(dialog).getByLabelText("Monthly limit")).toHaveValue(
      "5,000.00",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a new limit and shows it once the list reloads", async () => {
    const raised = { ...eventsCard, monthlyLimitCents: 7_500_00 };
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "PATCH"
        ? jsonResponse(raised)
        : jsonResponse([cloudCard, raised]),
    );
    const { user } = renderView();

    await user.click(
      panel("Events").getByRole("button", { name: "Edit limit" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("Monthly limit"));
    await user.type(dialog.getByLabelText("Monthly limit"), "7500");
    await user.click(dialog.getByRole("button", { name: "Save limit" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Monthly limit updated",
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/cards/${ids.cardEvents}`);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      monthlyLimitCents: 7_500_00,
    });
    expect(await panel("Events").findByText("of $7,500")).toBeInTheDocument();
  });
});
