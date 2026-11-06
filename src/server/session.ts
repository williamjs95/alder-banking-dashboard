import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { WORKSPACE_COOKIE } from "@/lib/domain";
import { contextFor, type RequestContext } from "@/server/http/handler";

/**
 * The request context for Server Components. Reading the cookie makes the
 * caller request-time rendered, so call this from inside a Suspense boundary.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const store = await cookies();
  // Everything past this point (the clock, the database) is per-request work
  // that must not be folded into a prerendered or prefetched shell.
  await connection();
  return contextFor(store.get(WORKSPACE_COOKIE)?.value);
}
