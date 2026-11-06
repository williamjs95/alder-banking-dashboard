import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE } from "@/lib/domain";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Gives every visitor an anonymous workspace id. There is no sign-in: the
 * cookie is the tenant key, and the server seeds a private demo company the
 * first time it sees a new id.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(WORKSPACE_COOKIE)) return NextResponse.next();

  const workspaceId = crypto.randomUUID();
  // Make the new id visible to this same request's render, not just the next one.
  request.cookies.set(WORKSPACE_COOKIE, workspaceId);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: WORKSPACE_COOKIE,
    value: workspaceId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

export const config = {
  // Skip static assets and metadata files; they never need a workspace.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|icon).*)"],
};
