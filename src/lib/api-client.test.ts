import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { errorResponse, jsonResponse } from "../../test/render";
import { api, ApiError, errorMessage, toQueryString } from "./api-client";

const FALLBACK = "Something went wrong. Please try again.";

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs `api` expecting it to reject, and returns what it threw. */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the request to fail");
}

describe("api", () => {
  it("GETs JSON by default and returns the parsed body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, count: 3 }));

    await expect(api("/api/accounts")).resolves.toEqual({ ok: true, count: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/accounts", {
      method: "GET",
      signal: undefined,
      headers: { Accept: "application/json" },
      body: undefined,
    });
  });

  it("sends a body as JSON with a content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "new" }, 201));
    const body = { amountCents: 12_50, memo: "Invoice 42" };

    await expect(
      api("/api/payments", { method: "POST", body }),
    ).resolves.toEqual({ id: "new" });

    expect(fetchMock).toHaveBeenCalledWith("/api/payments", {
      method: "POST",
      signal: undefined,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  });

  it("serializes falsy bodies rather than dropping them", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await api("/api/things", { method: "PATCH", body: null });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe("null");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends the idempotency key as a header when given one", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await api("/api/payments", {
      method: "POST",
      body: {},
      idempotencyKey: "key-123",
    });

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": "key-123",
    });
  });

  it("passes the abort signal through to fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { signal } = new AbortController();

    await api("/api/overview", { signal });

    expect(fetchMock.mock.calls[0][1]?.signal).toBe(signal);
  });

  it("throws the server's error with its status, code, message and fields", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(422, "validation_error", "Check the highlighted fields.", {
        amountCents: "Enter an amount greater than zero",
      }),
    );

    const error = await failure(api("/api/payments", { method: "POST" }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 422,
      code: "validation_error",
      message: "Check the highlighted fields.",
      fields: { amountCents: "Enter an amount greater than zero" },
    });
  });

  it("defaults fields to an empty object when the server sends none", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(404, "not_found", "Transaction not found."),
    );

    const error = await failure(api("/api/transactions/missing"));

    expect(error).toMatchObject({
      status: 404,
      code: "not_found",
      message: "Transaction not found.",
      fields: {},
    });
  });

  it("falls back to a generic error when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><body>Bad gateway</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const error = await failure(api("/api/overview"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: "unknown_error",
      message: FALLBACK,
      fields: {},
    });
  });

  it("falls back to a generic error when the JSON body has no error envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "nope" }, 500));

    const error = await failure(api("/api/overview"));

    expect(error).toMatchObject({
      status: 500,
      code: "unknown_error",
      message: FALLBACK,
    });
  });

  it("reports a network failure as an ApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await failure(api("/api/overview"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: "network_error",
      message:
        "Could not reach the server. Check your connection and try again.",
    });
  });

  it("rethrows an abort untouched so callers can tell it from a failure", async () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    fetchMock.mockRejectedValue(abort);

    const error = await failure(api("/api/overview"));

    expect(error).toBe(abort);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("treats any other DOMException as a network failure", async () => {
    fetchMock.mockRejectedValue(new DOMException("Blocked", "SecurityError"));

    const error = await failure(api("/api/overview"));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("errorMessage", () => {
  it("uses an ApiError's own message", () => {
    expect(
      errorMessage(
        new ApiError(409, "insufficient_funds", "Not enough funds."),
      ),
    ).toBe("Not enough funds.");
  });

  it.each([
    ["a plain Error", new Error("ECONNRESET at socket.js:42")],
    ["a string", "boom"],
    ["undefined", undefined],
    ["null", null],
  ])("hides the details of %s behind the generic message", (_name, thrown) => {
    expect(errorMessage(thrown)).toBe(FALLBACK);
  });
});

describe("toQueryString", () => {
  it("is empty when there is nothing to send", () => {
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ q: undefined, status: "", category: [] })).toBe("");
  });

  it("writes strings and numbers, keeping zero", () => {
    expect(toQueryString({ q: "stripe", page: 2, minCents: 0 })).toBe(
      "?q=stripe&page=2&minCents=0",
    );
  });

  it("joins lists with commas", () => {
    const query = toQueryString({ category: ["payroll", "taxes"], page: 1 });

    expect(query).toBe("?category=payroll%2Ctaxes&page=1");
    expect(new URLSearchParams(query).get("category")).toBe("payroll,taxes");
  });

  it("skips undefined, empty strings and empty lists but keeps the rest", () => {
    expect(
      toQueryString({ q: "", accountId: undefined, status: [], order: "asc" }),
    ).toBe("?order=asc");
  });

  it("encodes characters that are not safe in a URL", () => {
    const query = toQueryString({ q: "R&D / café #1" });

    expect(query.startsWith("?q=")).toBe(true);
    expect(query).not.toContain(" ");
    expect(query).not.toContain("#");
    expect(new URLSearchParams(query).get("q")).toBe("R&D / café #1");
  });
});
