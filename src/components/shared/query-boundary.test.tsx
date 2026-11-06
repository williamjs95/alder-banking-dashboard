import { useSuspenseQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
import { accounts } from "../../../test/fixtures";
import {
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { ApiError } from "@/lib/api-client";
import { accountsQuery } from "@/lib/queries";
import { QueryBoundary } from "./query-boundary";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  // React logs every error an error boundary catches. Expected here.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FALLBACK = <p>Loading accounts…</p>;

function AccountNames() {
  const { data } = useSuspenseQuery(accountsQuery);
  return (
    <ul>
      {data.map((account) => (
        <li key={account.id}>{account.name}</li>
      ))}
    </ul>
  );
}

describe("QueryBoundary", () => {
  it("renders its children when nothing goes wrong", () => {
    render(
      <QueryBoundary fallback={FALLBACK}>
        <p>All good</p>
      </QueryBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading accounts…")).not.toBeInTheDocument();
  });

  it("shows the fallback while a child is suspended, then the child", async () => {
    let respond!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );

    renderWithProviders(
      <QueryBoundary fallback={FALLBACK}>
        <AccountNames />
      </QueryBoundary>,
    );

    expect(screen.getByText("Loading accounts…")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    respond(jsonResponse(accounts));

    expect(await screen.findByText("Operating Checking")).toBeInTheDocument();
    expect(screen.getByText("Treasury")).toBeInTheDocument();
    expect(screen.queryByText("Loading accounts…")).not.toBeInTheDocument();
  });

  it("replaces a child that throws with a retry panel showing the API's message", () => {
    function Broken(): never {
      throw new ApiError(503, "unavailable", "The ledger is unavailable.");
    }

    render(
      <QueryBoundary fallback={FALLBACK}>
        <Broken />
      </QueryBoundary>,
    );

    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("This section could not load");
    expect(panel).toHaveTextContent("The ledger is unavailable.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("hides the details of an unexpected error behind a generic message", () => {
    function Broken(): never {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'map')",
      );
    }

    render(
      <QueryBoundary fallback={FALLBACK}>
        <Broken />
      </QueryBoundary>,
    );

    const panel = screen.getByRole("alert");
    expect(panel).toHaveTextContent("Something went wrong. Please try again.");
    expect(panel).not.toHaveTextContent("Cannot read properties");
  });

  it("keeps the failure contained, leaving the rest of the page in place", () => {
    function Broken(): never {
      throw new Error("boom");
    }

    render(
      <>
        <h1>Accounts</h1>
        <QueryBoundary fallback={FALLBACK}>
          <Broken />
        </QueryBoundary>
      </>,
    );

    expect(
      screen.getByRole("heading", { name: "Accounts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the child again on Try again", async () => {
    const user = userEvent.setup();
    let healthy = false;
    function Flaky() {
      if (!healthy) throw new Error("boom");
      return <p>Recovered</p>;
    }
    render(
      <QueryBoundary fallback={FALLBACK}>
        <Flaky />
      </QueryBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    healthy = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the panel again when the retry fails too", async () => {
    const user = userEvent.setup();
    function Broken(): never {
      throw new ApiError(503, "unavailable", "Still unavailable.");
    }
    render(
      <QueryBoundary fallback={FALLBACK}>
        <Broken />
      </QueryBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Still unavailable.");
  });

  it("refetches a failed query on Try again and shows the data when it succeeds", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        errorResponse(500, "internal_error", "Could not load accounts."),
      )
      .mockResolvedValueOnce(jsonResponse(accounts));

    renderWithProviders(
      <QueryBoundary fallback={FALLBACK}>
        <AccountNames />
      </QueryBoundary>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load accounts.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Savings Reserve")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/accounts",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
