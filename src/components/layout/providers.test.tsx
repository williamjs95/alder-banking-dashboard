import { useQuery, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../../../test/render";
import { getQueryClient, Providers } from "./providers";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  vi.restoreAllMocks();
  getQueryClient().clear();
  toast.dismiss();
});

describe("getQueryClient", () => {
  it("returns one shared client in the browser, so the cache survives re-renders", () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });

  it("does not refetch behind the reader's back when the window regains focus", () => {
    expect(
      getQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus,
    ).toBe(false);
  });

  it("retries a failed read once", () => {
    expect(getQueryClient().getDefaultOptions().queries?.retry).toBe(1);
  });
});

describe("Providers", () => {
  it("renders its children", () => {
    render(
      <Providers>
        <p>Dashboard</p>
      </Providers>,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("gives descendants the shared query client", () => {
    let seen: unknown;
    function Probe() {
      seen = useQueryClient();
      return null;
    }

    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(seen).toBe(getQueryClient());
  });

  it("lets descendants read data through that client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => jsonResponse({ name: "Treasury" }));
    function AccountName() {
      const { data } = useQuery({
        queryKey: ["providers-test", "account"],
        queryFn: async () => {
          const response = await fetch("/api/accounts/1");
          return (await response.json()) as { name: string };
        },
      });
      return <p>{data?.name ?? "Loading"}</p>;
    }

    render(
      <Providers>
        <AccountName />
      </Providers>,
    );

    expect(await screen.findByText("Treasury")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      getQueryClient().getQueryData(["providers-test", "account"]),
    ).toEqual({ name: "Treasury" });
  });

  it("supplies the tooltip context that tooltips anywhere in the app rely on", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <ThemeToggle />
      </Providers>,
    );

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Switch to dark theme",
    );
  });

  it("shows toasts raised from anywhere", async () => {
    render(
      <Providers>
        <p>Dashboard</p>
      </Providers>,
    );

    toast.success("Payment sent", { description: "$4,200.00 to Pilot.com" });

    expect(await screen.findByText("Payment sent")).toBeInTheDocument();
    expect(screen.getByText("$4,200.00 to Pilot.com")).toBeInTheDocument();
  });
});
