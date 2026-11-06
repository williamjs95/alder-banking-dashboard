import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ids } from "../../../test/fixtures";
import {
  errorResponse,
  jsonResponse,
  renderWithProviders,
} from "../../../test/render";
import { AccountNumbers } from "./account-numbers";

const fetchMock = vi.fn<typeof fetch>();
const numbers = { accountNumber: "000123454821", routingNumber: "021000021" };
const MASKED_ACCOUNT = "••••••••4821";
const MASKED_ROUTING = "•••••••••";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function renderNumbers() {
  // userEvent installs a working clipboard, so set it up before rendering.
  const user = userEvent.setup();
  renderWithProviders(<AccountNumbers accountId={ids.checking} last4="4821" />);
  return { user };
}

describe("AccountNumbers", () => {
  it("masks both numbers and requests nothing until asked", () => {
    renderNumbers();

    expect(screen.getByText(MASKED_ACCOUNT)).toBeInTheDocument();
    expect(screen.getByText(MASKED_ROUTING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show numbers" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /Copy/ }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the full numbers on reveal, keeping them masked while loading", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    const { user } = renderNumbers();

    await user.click(screen.getByRole("button", { name: "Show numbers" }));

    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    expect(screen.getByText(MASKED_ACCOUNT)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/accounts/${ids.checking}/numbers`);
    expect(init?.method).toBe("GET");

    respond(jsonResponse(numbers));

    expect(await screen.findByText("000123454821")).toBeInTheDocument();
    expect(screen.getByText("021000021")).toBeInTheDocument();
    expect(screen.queryByText(MASKED_ACCOUNT)).not.toBeInTheDocument();
    expect(screen.queryByText(MASKED_ROUTING)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide numbers" })).toBeEnabled();
  });

  it("offers a copy button for each revealed number", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(numbers));
    const { user } = renderNumbers();

    await user.click(screen.getByRole("button", { name: "Show numbers" }));
    await user.click(
      await screen.findByRole("button", { name: "Copy account number" }),
    );

    expect(await navigator.clipboard.readText()).toBe("000123454821");
    expect(
      await screen.findByRole("button", { name: "account number copied" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Copy routing number" }),
    );

    expect(await navigator.clipboard.readText()).toBe("021000021");
  });

  it("masks the numbers again on hide and re-fetches on the next reveal", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(numbers));
    const { user } = renderNumbers();

    await user.click(screen.getByRole("button", { name: "Show numbers" }));
    await screen.findByText("000123454821");

    await user.click(screen.getByRole("button", { name: "Hide numbers" }));

    expect(screen.getByText(MASKED_ACCOUNT)).toBeInTheDocument();
    expect(screen.getByText(MASKED_ROUTING)).toBeInTheDocument();
    expect(screen.queryByText("000123454821")).not.toBeInTheDocument();
    expect(screen.queryByText("021000021")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Copy/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show numbers" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Nothing is kept from the first reveal: showing again asks the server again.
    await user.click(screen.getByRole("button", { name: "Show numbers" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("000123454821")).toBeInTheDocument();
  });

  it("explains a failed request and leaves the numbers masked", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(403, "forbidden", "You cannot view these account numbers"),
    );
    const { user } = renderNumbers();

    await user.click(screen.getByRole("button", { name: "Show numbers" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You cannot view these account numbers",
    );
    expect(screen.getByText(MASKED_ACCOUNT)).toBeInTheDocument();
    expect(screen.getByText(MASKED_ROUTING)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Copy/ }),
    ).not.toBeInTheDocument();

    // Hiding dismisses the error along with the reveal.
    await user.click(screen.getByRole("button", { name: "Hide numbers" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show numbers" })).toBeEnabled();
  });
});
