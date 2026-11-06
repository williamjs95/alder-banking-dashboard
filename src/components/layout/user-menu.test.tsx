import { act, screen, within } from "@testing-library/react";
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
import {
  createTestQueryClient,
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { DEMO_USER, UserMenu } from "./user-menu";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => jsonResponse({ ok: true }));
});

afterEach(() => {
  vi.restoreAllMocks();
  router.push.mockClear();
  router.refresh.mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

const accountButton = () => screen.getByRole("button", { name: /Maya Chen/ });

function setup() {
  const user = userEvent.setup();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(["overview"], { totalBalanceCents: 1 });
  queryClient.setQueryData(["transactions", "list", {}], { items: [] });
  renderWithProviders(<UserMenu />, { queryClient });
  const staleQueries = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey[0]);
  return { user, queryClient, staleQueries };
}

/** Opens the account menu and chooses "Reset demo data". */
async function openConfirmation() {
  const context = setup();
  await context.user.click(accountButton());
  await context.user.click(
    await screen.findByRole("menuitem", { name: "Reset demo data" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Reset demo data?",
  });
  return { ...context, dialog };
}

describe("UserMenu", () => {
  it("shows who is signed in and for which company", () => {
    setup();

    const button = accountButton();
    expect(button).toHaveTextContent(DEMO_USER.name);
    expect(button).toHaveTextContent("Brightline Labs, Inc.");
    expect(within(button).getByText("MC")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("is closed at rest", () => {
    setup();

    expect(accountButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a menu explaining the demo workspace, with a reset action", async () => {
    const { user } = setup();

    await user.click(accountButton());

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent(
      "Demo workspace. Changes are private to this browser.",
    );
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Reset demo data"]);
    // The menu is modal: the rest of the page is hidden from assistive tech.
    expect(
      screen.getByRole("button", { name: /Maya Chen/, hidden: true }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("can be opened and operated from the keyboard", async () => {
    const { user } = setup();

    await user.tab();
    expect(accountButton()).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(
      await screen.findByRole("dialog", { name: "Reset demo data?" }),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before resetting, spelling out what will be lost", async () => {
    const { dialog } = await openConfirmation();

    expect(dialog).toHaveAccessibleDescription(
      "Payments, transfers, cards, recipients and notes you added will be removed, and the workspace returns to its starting state.",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Reset data" }),
    ).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing on Cancel", async () => {
    const { user, dialog, staleQueries } = await openConfirmation();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(staleQueries()).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does nothing when dismissed with Escape", async () => {
    const { user } = await openConfirmation();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the reset when confirmed", async () => {
    const { user, dialog } = await openConfirmation();

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/demo/reset",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("locks the confirm button while the reset is in flight", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const { user, dialog } = await openConfirmation();

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    const pending = await within(dialog).findByRole("button", {
      name: "Resetting…",
    });
    expect(pending).toBeDisabled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => respond(jsonResponse({ ok: true })));

    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on success closes the dialog, refreshes everything and confirms with a toast", async () => {
    const { user, dialog, queryClient, staleQueries } =
      await openConfirmation();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Demo data reset", {
      description:
        "Balances and transactions are back to their starting state.",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Every cached query, not a hand-picked few.
    expect(invalidate).toHaveBeenCalledWith();
    expect(staleQueries()).toEqual(["overview", "transactions"]);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("marks the cache stale before asking the server to re-render", async () => {
    const { user, dialog, queryClient } = await openConfirmation();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      router.refresh.mock.invocationCallOrder[0],
    );
  });

  it("shows the server's message and keeps the dialog open when the reset fails", async () => {
    fetchMock.mockImplementation(async () =>
      errorResponse(500, "internal_error", "Could not reset the demo data."),
    );
    const { user, dialog, staleQueries } = await openConfirmation();

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not reset the demo data.",
      ),
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("dialog", { name: "Reset demo data?" }),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("button", { name: "Reset data" }),
    ).toBeEnabled();
    expect(staleQueries()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains a network failure in plain words", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user, dialog } = await openConfirmation();

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not reach the server. Check your connection and try again.",
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lets the person try again after a failure", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        errorResponse(503, "unavailable", "Try again shortly."),
      )
      .mockImplementationOnce(async () => jsonResponse({ ok: true }));
    const { user, dialog } = await openConfirmation();

    await user.click(
      within(dialog).getByRole("button", { name: "Reset data" }),
    );
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    await user.click(
      await within(dialog).findByRole("button", { name: "Reset data" }),
    );

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
