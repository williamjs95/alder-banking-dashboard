import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { RecipientDto, TransactionListDto } from "@/lib/contracts";
import { queryKeys, SCHEDULED_PAYMENTS } from "@/lib/queries";
import {
  accounts,
  ids,
  recipients,
  transactionList,
  transactions,
} from "../../../test/fixtures";
import {
  createTestQueryClient,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { PaymentsView } from "./payments-view";

/**
 * Next.js mirrors History API updates into `useSearchParams`. This stand-in
 * does the same: the hooks read the real jsdom location and re-render when the
 * test's `replaceState` spy reports a change, so a click that writes `?new=`
 * to the URL opens the dialog here exactly as it does in the app.
 */
const navigation = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          navigation.subscribe,
          () => window.location.search,
        ),
      ),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const noScheduled: TransactionListDto = {
  ...transactionList,
  items: [],
  total: 0,
  summary: { inflowCents: 0, outflowCents: 0, netCents: 0 },
};
const oneScheduled: TransactionListDto = {
  ...transactionList,
  items: [transactions.scheduled],
  total: 1,
};

const fetchMock = vi.fn<typeof fetch>();
let replaceState: MockInstance<History["replaceState"]>;

function setup({
  search = "",
  recipientList = recipients,
  scheduled = noScheduled,
}: {
  search?: string;
  recipientList?: RecipientDto[];
  /** `null` leaves the scheduled list out of the cache, so it is fetched. */
  scheduled?: TransactionListDto | null;
} = {}) {
  window.history.replaceState(null, "", `/payments${search}`);
  replaceState.mockClear();

  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.accounts, accounts);
  queryClient.setQueryData(queryKeys.recipients, recipientList);
  if (scheduled) {
    queryClient.setQueryData(
      queryKeys.transactions(SCHEDULED_PAYMENTS),
      scheduled,
    );
  }
  renderWithProviders(<PaymentsView />, { queryClient });
  return { queryClient, user: userEvent.setup() };
}

beforeEach(() => {
  const native = window.history.replaceState.bind(window.history);
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((...args) => {
      native(...args);
      navigation.notify();
    });
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  replaceState.mockRestore();
  window.history.replaceState(null, "", "/");
});

describe("PaymentsView", () => {
  describe("recipients", () => {
    it("lists each saved recipient with their bank, account ending and default method", () => {
      setup();

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText("Gunderson Dettmer LLP")).toBeVisible();
      expect(
        within(rows[0]).getByText("First Republic ••7715 · Wire"),
      ).toBeVisible();
      expect(
        within(rows[0]).getByRole("button", {
          name: "Pay Gunderson Dettmer LLP",
        }),
      ).toBeEnabled();
      expect(within(rows[1]).getByText("Pilot.com, Inc.")).toBeVisible();
      expect(
        within(rows[1]).getByText("Silicon Valley Bank ••4406 · ACH"),
      ).toBeVisible();
      expect(
        within(rows[1]).getByRole("button", { name: "Pay Pilot.com, Inc." }),
      ).toBeEnabled();
      expect(screen.queryByText("No recipients yet")).not.toBeInTheDocument();
    });

    it("explains how to start when there are no recipients", () => {
      setup({ recipientList: [] });

      expect(screen.getByText("No recipients yet")).toBeVisible();
      expect(
        screen.getByText(
          "Add the people and businesses you pay to send money in one step.",
        ),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /^Pay / }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add recipient" }),
      ).toBeEnabled();
    });
  });

  describe("scheduled payments", () => {
    it("links each scheduled payment to its transaction", () => {
      setup({ scheduled: oneScheduled });

      const link = screen.getByRole("link", { name: /Gusto Payroll/ });
      expect(link).toHaveAttribute(
        "href",
        `/transactions?tx=${ids.txScheduled}`,
      );
      expect(within(link).getByText("-$75,725.95")).toBeVisible();
      expect(within(link).getByText("Scheduled")).toBeVisible();
      expect(screen.queryByText("Nothing scheduled")).not.toBeInTheDocument();
      // Server-seeded data is fresh: nothing is requested again on mount.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows a loading placeholder while the list is requested, then the payments", async () => {
      let respond!: (response: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      );
      setup({ scheduled: null });

      expect(screen.getByText("Loading…")).toBeVisible();
      expect(screen.queryByText("Nothing scheduled")).not.toBeInTheDocument();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(fetchMock.mock.calls[0][0]).toBe(
        "/api/transactions?order=asc&pageSize=10&status=scheduled",
      );

      respond(jsonResponse(oneScheduled));

      expect(
        await screen.findByRole("link", { name: /Gusto Payroll/ }),
      ).toBeVisible();
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });

    it("says the list could not load, rather than that it is empty", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "internal_error", message: "Something went wrong." },
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
      setup({ scheduled: null });

      expect(
        await screen.findByText("Scheduled payments could not load"),
      ).toBeVisible();
      expect(screen.queryByText("Nothing scheduled")).not.toBeInTheDocument();
    });

    it("says so when nothing is scheduled", () => {
      setup({ scheduled: noScheduled });

      expect(screen.getByText("Nothing scheduled")).toBeVisible();
      expect(
        screen.getByText(
          "Choose a future date when sending money and it will wait here.",
        ),
      ).toBeVisible();
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });
  });

  describe("dialogs opened from the URL", () => {
    it("shows no dialog without a `new` parameter", () => {
      setup();

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores a `new` value it does not know", () => {
      setup({ search: "?new=card" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it.each([
      ["?new=payment", "Send money"],
      ["?new=transfer", "Transfer between accounts"],
      ["?new=recipient", "Add recipient"],
    ])("opens the dialog for %s", (search, title) => {
      setup({ search });

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: title })).toBeVisible();
    });

    it("preselects the recipient named in the URL, with their default method", () => {
      setup({ search: `?new=payment&recipient=${ids.recipientGunderson}` });

      const dialog = screen.getByRole("dialog", { name: "Send money" });
      expect(
        within(dialog).getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Gunderson Dettmer LLP");
      expect(
        within(dialog).getByRole("radio", { name: "Wire · $15" }),
      ).toBeChecked();
    });

    it("offers every account to pay or transfer from", async () => {
      const { user } = setup({ search: "?new=transfer" });

      await user.click(screen.getByRole("combobox", { name: "From" }));

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual([
        "Operating Checking$250,000.00",
        "Savings Reserve$600,000.00",
        "Treasury$900,000.00",
      ]);
    });
  });

  describe("opening and closing", () => {
    it.each([
      [/^Send money/, "/payments?new=payment", "Send money"],
      [
        /^Transfer between accounts/,
        "/payments?new=transfer",
        "Transfer between accounts",
      ],
      [/^Add recipient$/, "/payments?new=recipient", "Add recipient"],
    ])(
      "the %s button writes %s to the URL and its dialog opens",
      async (button, url, title) => {
        const { user } = setup();

        await user.click(screen.getByRole("button", { name: button }));

        expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", url);
        expect(screen.getByRole("dialog", { name: title })).toBeVisible();
      },
    );

    it("starts a payment to a recipient from their Pay button", async () => {
      const { user } = setup();

      await user.click(
        screen.getByRole("button", { name: "Pay Pilot.com, Inc." }),
      );

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(
        null,
        "",
        `/payments?new=payment&recipient=${ids.recipientPilot}`,
      );
      const dialog = screen.getByRole("dialog", { name: "Send money" });
      expect(
        within(dialog).getByRole("combobox", { name: "Recipient" }),
      ).toHaveTextContent("Pilot.com, Inc.");
      expect(
        within(dialog).getByRole("radio", { name: "ACH · free" }),
      ).toBeChecked();
    });

    it.each([
      [`?new=payment&recipient=${ids.recipientPilot}`],
      ["?new=transfer"],
      ["?new=recipient"],
    ])(
      "cancelling the dialog at %s clears the URL and closes it",
      async (search) => {
        const { user } = setup({ search });

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(replaceState).toHaveBeenCalledExactlyOnceWith(
          null,
          "",
          "/payments",
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
      },
    );

    it("closes on Escape as well", async () => {
      const { user } = setup({ search: "?new=transfer" });

      await user.keyboard("{Escape}");

      expect(replaceState).toHaveBeenCalledExactlyOnceWith(
        null,
        "",
        "/payments",
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    });
  });

  it("adds a recipient from the page: the dialog closes and the new recipient is listed", async () => {
    const created: RecipientDto = {
      id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
      name: "Acme Supplies",
      email: null,
      bankName: "Chase",
      accountLast4: "6789",
      defaultMethod: "ach",
      createdAt: "2026-06-18T12:00:00.000Z",
    };
    fetchMock.mockImplementation(async (input, init) => {
      if (input === "/api/recipients" && init?.method === "POST") {
        return jsonResponse(created, 201);
      }
      if (input === "/api/recipients") {
        return jsonResponse([...recipients, created]);
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Add recipient" }));
    const dialog = screen.getByRole("dialog", { name: "Add recipient" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Acme Supplies",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Bank" }),
      "Chase",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Routing number" }),
      "021000021",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Account number" }),
      "123456789",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add recipient" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/payments");
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(
      "Acme Supplies added",
    );
    expect(
      await screen.findByRole("button", { name: "Pay Acme Supplies" }),
    ).toBeVisible();
    expect(screen.getByText("Chase ••6789 · ACH")).toBeVisible();
  });
});
