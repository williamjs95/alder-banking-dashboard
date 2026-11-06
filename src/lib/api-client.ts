import type { ApiErrorBody } from "./contracts";

/** A failed API call, carrying the server's code and per-field messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.fields,
      );
    }
  } catch {
    // Not JSON (a proxy error page, for instance). Fall through.
  }
  return new ApiError(response.status, "unknown_error", FALLBACK_MESSAGE);
}

export type ApiRequest = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

/** Typed fetch for the app's own JSON API. Throws `ApiError` on any non-2xx. */
export async function api<T>(
  path: string,
  { method = "GET", body, idempotencyKey, signal }: ApiRequest = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the server. Check your connection and try again.",
    );
  }
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as T;
}

/** The message to show a person for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_MESSAGE;
}

/** Serializes defined, non-empty values into a query string ("" or "?a=1"). */
export function toQueryString(
  params: Record<string, string | number | readonly string[] | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
