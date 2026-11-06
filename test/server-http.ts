import { afterAll, beforeAll, vi } from "vitest";
import type { ApiErrorBody } from "@/lib/contracts";
import { WORKSPACE_COOKIE } from "@/lib/domain";
import { getDb, type Db } from "@/server/db/client";
import { createSeededDb, NOW, WORKSPACE_ID } from "./db";

type ApiRequestInit = {
  method?: string;
  /** Sent as the JSON body. */
  json?: unknown;
  /** Sent verbatim, for malformed-body tests. */
  rawBody?: string;
  /** The visitor's workspace cookie. Pass `null` to send no cookie at all. */
  workspaceId?: string | null;
  headers?: Record<string, string>;
};

/** A request as a route handler would receive it from a signed-in visitor. */
export function apiRequest(
  path: string,
  {
    method = "GET",
    json,
    rawBody,
    workspaceId = WORKSPACE_ID,
    headers = {},
  }: ApiRequestInit = {},
): Request {
  const body =
    rawBody ?? (json === undefined ? undefined : JSON.stringify(json));
  return new Request(`http://test${path}`, {
    method,
    body,
    headers: {
      ...(workspaceId === null
        ? {}
        : { cookie: `${WORKSPACE_COOKIE}=${workspaceId}` }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
  });
}

/** The second argument Next.js passes to a route handler. */
export function segment<P>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

export const noParams = segment<Record<string, never>>({});

export async function errorOf(
  response: Response,
): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

export const UNKNOWN_ID = "5f0c2f6e-3a41-4a4e-9c53-0d1e2f3a4b5c";

/**
 * Points the route handlers at one seeded in-memory database for the whole
 * test file and freezes the clock at `NOW`, so "today" in a handler is the day
 * the demo data was generated for.
 *
 * The test file itself must mock the database module, because `vi.mock` is
 * hoisted per file:
 *
 *   vi.mock("@/server/db/client", async (importOriginal) => ({
 *     ...(await importOriginal<typeof import("@/server/db/client")>()),
 *     getDb: vi.fn(),
 *   }));
 */
export function setupSeededRouteDb(): { db: Db } {
  const handle = {} as { db: Db };
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    handle.db = await createSeededDb();
    vi.mocked(getDb).mockResolvedValue(handle.db);
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  return handle;
}
