import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { ids, transactionList } from "../../../test/fixtures";
import {
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import type { TransactionListDto } from "@/lib/contracts";
import { CommandMenu } from "./command-menu";
import { THEME_STORAGE_KEY } from "./theme-script";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const EMPTY_LIST: TransactionListDto = {
  ...transactionList,
  items: [],
  total: 0,
  summary: { inflowCents: 0, outflowCents: 0, netCents: 0 },
};

/** A tiny search backend: matches fixture transactions by description. */
function searchResponse(input: RequestInfo | URL): Response {
  const url = new URL(String(input), "http://localhost");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const items = transactionList.items.filter((transaction) =>
    transaction.description.toLowerCase().includes(q),
  );
  return jsonResponse({ ...EMPTY_LIST, items, total: items.length });
}

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => searchResponse(input));
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  router.push.mockClear();
  router.refresh.mockClear();
});

const trigger = () => screen.getByRole("button", { name: /Search or jump to/ });
const palette = () => screen.queryByRole("dialog");
const optionNames = () =>
  screen.getAllByRole("option").map((option) => option.textContent);
const requestedUrls = () =>
  fetchMock.mock.calls.map(([input]) => String(input));

/** Renders the menu and opens it from the trigger button. */
async function openPalette() {
  const user = userEvent.setup();
  renderWithProviders(<CommandMenu />);
  await user.click(trigger());
  const input = await screen.findByRole("combobox");
  return { user, input };
}

describe("CommandMenu", () => {
  describe("opening and closing", () => {
    it("is closed at rest and requests nothing", () => {
      renderWithProviders(<CommandMenu />);

      expect(trigger()).toHaveTextContent("⌘K");
      expect(palette()).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("opens from the search button, with the cursor in a labelled search dialog", async () => {
      const { input } = await openPalette();

      expect(palette()).toHaveAccessibleName("Search");
      expect(palette()).toHaveAccessibleDescription(
        "Search transactions, jump to a page or run an action.",
      );
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute(
        "placeholder",
        "Search transactions or jump to…",
      );
    });

    it.each([
      ["⌘K", "{Meta>}k{/Meta}"],
      ["Ctrl+K", "{Control>}k{/Control}"],
      ["⌘K with Caps Lock on", "{Meta>}K{/Meta}"],
    ])("opens with %s", async (_name, keys) => {
      const user = userEvent.setup();
      renderWithProviders(<CommandMenu />);

      await user.keyboard(keys);

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("closes again with the same shortcut", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CommandMenu />);

      await user.keyboard("{Meta>}k{/Meta}");
      await screen.findByRole("dialog");
      await user.keyboard("{Meta>}k{/Meta}");

      expect(palette()).not.toBeInTheDocument();
    });

    it("ignores a plain K, and other shortcuts", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CommandMenu />);

      await user.keyboard("k");
      await user.keyboard("{Meta>}j{/Meta}");
      await user.keyboard("{Control>}p{/Control}");

      expect(palette()).not.toBeInTheDocument();
    });

    it("takes the shortcut over from the browser, and leaves other keys alone", () => {
      renderWithProviders(<CommandMenu />);

      // fireEvent returns false when a handler called preventDefault().
      let allowedDefault = true;
      act(() => {
        allowedDefault = fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      });
      expect(allowedDefault).toBe(false);
      expect(fireEvent.keyDown(window, { key: "k" })).toBe(true);
      expect(fireEvent.keyDown(window, { key: "l", ctrlKey: true })).toBe(true);
    });

    it("closes on Escape", async () => {
      const { user } = await openPalette();

      await user.keyboard("{Escape}");

      expect(palette()).not.toBeInTheDocument();
    });

    it("stops listening for the shortcut once removed from the page", async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<CommandMenu />);

      unmount();
      await user.keyboard("{Meta>}k{/Meta}");

      expect(palette()).not.toBeInTheDocument();
    });

    it("starts from an empty query each time it opens", async () => {
      const { user, input } = await openPalette();
      await user.type(input, "cards");
      expect(optionNames()).toEqual(["Cards"]);

      await user.keyboard("{Escape}");
      await user.click(trigger());

      expect(await screen.findByRole("combobox")).toHaveValue("");
      expect(screen.getAllByRole("option")).toHaveLength(10);
    });
  });

  describe("pages and actions", () => {
    it("lists every page under Go to and every action under Actions", async () => {
      await openPalette();

      const pages = screen.getByRole("group", { name: "Go to" });
      expect(
        within(pages)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([
        "Overview",
        "Transactions",
        "Accounts",
        "Payments",
        "Cards",
        "Insights",
      ]);
      const actions = screen.getByRole("group", { name: "Actions" });
      expect(
        within(actions)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([
        "Send money",
        "Transfer between accounts",
        "Issue a virtual card",
        "Switch to dark theme",
      ]);
      expect(
        screen.queryByRole("group", { name: "Transactions" }),
      ).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["Overview", "/"],
      ["Transactions", "/transactions"],
      ["Insights", "/insights"],
      ["Send money", "/payments?new=payment"],
      ["Transfer between accounts", "/payments?new=transfer"],
      ["Issue a virtual card", "/cards?new=card"],
    ])("goes to %s and closes", async (name, href) => {
      const { user } = await openPalette();

      await user.click(screen.getByRole("option", { name }));

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(href);
      expect(palette()).not.toBeInTheDocument();
    });

    it("narrows pages and actions to those matching what is typed", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "card");

      expect(optionNames()).toEqual(["Cards", "Issue a virtual card"]);
    });

    it("matches regardless of case and surrounding spaces", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "  INSIGHTS ");

      expect(optionNames()).toEqual(["Insights"]);
    });

    it("drops the Actions group when only pages match", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "overv");

      expect(optionNames()).toEqual(["Overview"]);
      expect(screen.getByRole("group", { name: "Go to" })).toBeInTheDocument();
      expect(
        screen.queryByRole("group", { name: "Actions" }),
      ).not.toBeInTheDocument();
    });

    it("drops the Go to group when only actions match", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "send");

      expect(optionNames()).toEqual(["Send money"]);
      expect(
        screen.queryByRole("group", { name: "Go to" }),
      ).not.toBeInTheDocument();
    });

    it("keeps the Actions group for the theme switch alone", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "theme");

      expect(optionNames()).toEqual(["Switch to dark theme"]);
      expect(
        screen.getByRole("group", { name: "Actions" }),
      ).toBeInTheDocument();
    });

    it("runs the highlighted result on Enter, without touching the mouse", async () => {
      const { user } = await openPalette();

      await user.keyboard("accounts");
      expect(optionNames()).toEqual(["Accounts", "Transfer between accounts"]);
      await user.keyboard("{ArrowDown}{Enter}");

      expect(router.push).toHaveBeenCalledWith("/payments?new=transfer");
      expect(palette()).not.toBeInTheDocument();
    });
  });

  describe("theme", () => {
    it("switches to the dark theme, remembers it, and closes without navigating", async () => {
      const { user } = await openPalette();

      await user.click(
        screen.getByRole("option", { name: "Switch to dark theme" }),
      );

      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(palette()).not.toBeInTheDocument();
      expect(router.push).not.toHaveBeenCalled();
    });

    it("offers the light theme, with a sun, once the page is dark", async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const { user } = await openPalette();

      const option = screen.getByRole("option", {
        name: "Switch to light theme",
      });
      expect(option.querySelector("svg")).toHaveClass("lucide-sun");
      expect(
        screen.queryByRole("option", { name: "Switch to dark theme" }),
      ).not.toBeInTheDocument();

      await user.click(option);

      expect(document.documentElement).toHaveAttribute("data-theme", "light");
    });

    it("shows a moon next to the offer of the dark theme", async () => {
      await openPalette();

      expect(
        screen
          .getByRole("option", { name: "Switch to dark theme" })
          .querySelector("svg"),
      ).toHaveClass("lucide-moon");
    });
  });

  describe("transaction search", () => {
    it("searches transactions for what was typed and lists the matches", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "stripe");

      const results = await screen.findByRole("group", {
        name: "Transactions",
      });
      const [match] = within(results).getAllByRole("option");
      expect(within(results).getAllByRole("option")).toHaveLength(1);
      expect(within(match).getByText("Stripe")).toBeInTheDocument();
      expect(within(match).getByText("Jun 17")).toBeInTheDocument();
      expect(within(match).getByText("+$11,048.20")).toHaveClass(
        "text-positive",
      );
      expect(requestedUrls()).toEqual([
        "/api/transactions?pageSize=10&q=stripe",
      ]);
    });

    it("lists matching pages and actions alongside matching transactions", async () => {
      const { user, input } = await openPalette();

      // "tr" is in Transactions, Transfer between accounts, Stripe and
      // Transfer to Operating Checking.
      await user.type(input, "tr");

      const results = await screen.findByRole("group", {
        name: "Transactions",
      });
      expect(
        within(screen.getByRole("group", { name: "Go to" }))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Transactions"]);
      expect(
        within(screen.getByRole("group", { name: "Actions" }))
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["Transfer between accounts"]);
      expect(within(results).getByText("Stripe")).toBeInTheDocument();
      expect(
        within(results).getByText("Transfer to Operating Checking"),
      ).toBeInTheDocument();
      expect(within(results).getByText("-$60,000.00")).not.toHaveClass(
        "text-positive",
      );
    });

    it("opens the chosen transaction and closes", async () => {
      const { user, input } = await openPalette();
      await user.type(input, "amazon");

      await user.click(
        await screen.findByRole("option", { name: /Amazon Web Services/ }),
      );

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith(`/transactions?tx=${ids.txAws}`);
      expect(palette()).not.toBeInTheDocument();
    });

    it("sends the query trimmed", async () => {
      const { user, input } = await openPalette();

      await user.type(input, "  gusto ");

      expect(
        await screen.findByRole("option", { name: /Gusto Payroll/ }),
      ).toBeInTheDocument();
      expect(requestedUrls()).toEqual([
        "/api/transactions?pageSize=10&q=gusto",
      ]);
    });

    it("says it is searching from the first keystrokes, before the request starts", async () => {
      fetchMock.mockReturnValue(new Promise<Response>(() => {}));
      const { user, input } = await openPalette();

      await user.type(input, "zzzz");

      // Still inside the debounce window: nothing has been requested yet.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("Searching…")).toBeInTheDocument();
      expect(screen.queryByText("No results.")).not.toBeInTheDocument();
    });

    it("says it is searching while the request is out, then that nothing matched", async () => {
      let respond!: (response: Response) => void;
      fetchMock.mockReturnValue(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      );
      const { user, input } = await openPalette();

      await user.type(input, "zzzz");

      expect(await screen.findByText("Searching…")).toBeInTheDocument();
      expect(screen.queryByRole("option")).not.toBeInTheDocument();

      await act(async () => respond(jsonResponse(EMPTY_LIST)));

      expect(await screen.findByText("No results.")).toBeInTheDocument();
      expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    });

    it("says the search is unavailable when the request fails", async () => {
      fetchMock.mockImplementation(async () =>
        errorResponse(500, "internal_error", "Search is unavailable."),
      );
      const { user, input } = await openPalette();

      await user.type(input, "zzzz");

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByText("Search is unavailable right now. Try again."),
      ).toBeInTheDocument();
      expect(screen.queryByText("No results.")).not.toBeInTheDocument();
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });

    it("still offers matching pages when the search fails", async () => {
      fetchMock.mockImplementation(async () =>
        errorResponse(500, "internal_error", "Search is unavailable."),
      );
      const { user, input } = await openPalette();

      await user.type(input, "cards");

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(optionNames()).toEqual(["Cards"]);
      expect(screen.queryByText("No results.")).not.toBeInTheDocument();
    });

    describe("debouncing", () => {
      // Exact timings need a clock the test controls, and fireEvent rather
      // than userEvent, which waits on real timers between keystrokes.
      function openWithFakeClock() {
        vi.useFakeTimers();
        renderWithProviders(<CommandMenu />);
        fireEvent.click(trigger());
        const input = screen.getByRole("combobox");
        const type = (value: string) =>
          fireEvent.change(input, { target: { value } });
        const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
        return { type, wait };
      }

      it("waits 200ms after the last keystroke, then searches once for the final text", () => {
        const { type, wait } = openWithFakeClock();

        type("aw");
        wait(199);
        expect(fetchMock).not.toHaveBeenCalled();

        // Another keystroke restarts the wait.
        type("aws");
        wait(199);
        expect(fetchMock).not.toHaveBeenCalled();

        wait(1);
        expect(requestedUrls()).toEqual([
          "/api/transactions?pageSize=10&q=aws",
        ]);
      });

      it("does not search for a single character", () => {
        const { type, wait } = openWithFakeClock();

        type("x");
        wait(5_000);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText("No results.")).toBeInTheDocument();
      });

      it("does not count surrounding spaces toward the two-character minimum", () => {
        const { type, wait } = openWithFakeClock();

        type("  a  ");
        wait(5_000);

        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("searches from two characters", () => {
        const { type, wait } = openWithFakeClock();

        type("st");
        wait(200);

        expect(requestedUrls()).toEqual(["/api/transactions?pageSize=10&q=st"]);
      });

      it("stops searching when the query drops back below two characters", () => {
        const { type, wait } = openWithFakeClock();
        type("st");
        wait(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        type("s");
        wait(5_000);

        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    it("clears transaction results when the query is shortened below two characters", async () => {
      const { user, input } = await openPalette();
      await user.type(input, "stripe");
      await screen.findByRole("group", { name: "Transactions" });

      await user.clear(input);
      await user.type(input, "s");

      await vi.waitFor(() =>
        expect(
          screen.queryByRole("group", { name: "Transactions" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.queryByText("Stripe")).not.toBeInTheDocument();
    });
  });
});
