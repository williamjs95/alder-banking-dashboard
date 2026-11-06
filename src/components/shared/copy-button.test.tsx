import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(toast.error).mockClear();
});

describe("CopyButton", () => {
  it("offers to copy the labelled value", () => {
    render(<CopyButton value="021000021" label="routing number" />);

    expect(
      screen.getByRole("button", { name: "Copy routing number" }),
    ).toBeInTheDocument();
  });

  it("puts the value on the clipboard and confirms it", async () => {
    // userEvent.setup() installs a working clipboard on navigator.
    const user = userEvent.setup();
    render(<CopyButton value="021000021" label="routing number" />);

    await user.click(
      screen.getByRole("button", { name: "Copy routing number" }),
    );

    expect(
      await screen.findByRole("button", { name: "routing number copied" }),
    ).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe("021000021");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("goes back to offering a copy after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton value="4821" label="account number" />);

    await user.click(
      screen.getByRole("button", { name: "Copy account number" }),
    );
    await screen.findByRole("button", { name: "account number copied" });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(
      screen.getByRole("button", { name: "account number copied" }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      screen.getByRole("button", { name: "Copy account number" }),
    ).toBeInTheDocument();
  });

  it("stops its timer when removed while still confirming", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(
      <CopyButton value="4821" label="account number" />,
    );
    await user.click(screen.getByRole("button"));
    await screen.findByRole("button", { name: "account number copied" });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("explains what to do when the browser refuses clipboard access", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new DOMException("Write permission denied.", "NotAllowedError"),
    );
    render(<CopyButton value="021000021" label="routing number" />);

    await user.click(
      screen.getByRole("button", { name: "Copy routing number" }),
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not copy. Select the text and copy it manually.",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Copy routing number" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "routing number copied" }),
    ).not.toBeInTheDocument();
  });
});
