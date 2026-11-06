import "server-only";

import { z } from "zod";
import type { ApiErrorBody } from "@/lib/contracts";
import { WORKSPACE_COOKIE } from "@/lib/domain";
import { getDb, type Db } from "@/server/db/client";
import { ensureWorkspace } from "@/server/services/workspace";
import { AppError, conflict, invalid } from "./errors";

/** What every request handler needs: a database, a tenant and a clock. */
export type RequestContext = { db: Db; workspaceId: string; now: Date };

const workspaceIdSchema = z.uuid();

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        // A malformed percent-escape is a bad cookie, not a server error.
        return null;
      }
    }
  }
  return null;
}

/** Resolves the visitor's workspace, seeding it on first use. */
export async function contextFor(
  workspaceId: string | null | undefined,
): Promise<RequestContext> {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) {
    throw new AppError(
      "no_workspace",
      401,
      "Your demo session was not found. Reload the page to start a new one.",
    );
  }
  const db = await getDb();
  const now = new Date();
  await ensureWorkspace(db, parsed.data, now);
  return { db, workspaceId: parsed.data, now };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw invalid("Some fields need attention.", fieldErrors(result.error));
  }
  return result.data;
}

export function parseQuery<S extends z.ZodType>(
  request: Request,
  schema: S,
): z.output<S> {
  const params = new URL(request.url).searchParams;
  return parse(schema, Object.fromEntries(params));
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("bad_request", 400, "The request body is not JSON.");
  }
  return parse(schema, body);
}

export function parseId(value: string, what: string): string {
  const result = workspaceIdSchema.safeParse(value);
  if (!result.success)
    throw new AppError("not_found", 404, `${what} was not found.`);
  return result.data;
}

/** Idempotency keys are optional, but if one is sent it must be sane. */
export function readIdempotencyKey(request: Request): string | undefined {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) return undefined;
  if (key.length > 100) {
    throw new AppError("bad_request", 400, "Idempotency-Key is too long.");
  }
  return key;
}

const UNIQUE_VIOLATION = "23505";

function postgresCode(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = candidate?.code ?? candidate?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

export function errorResponse(error: unknown): Response {
  let known: AppError;
  if (error instanceof AppError) {
    known = error;
  } else if (postgresCode(error) === UNIQUE_VIOLATION) {
    // Two requests raced with the same idempotency key; the other one won.
    known = conflict("This request is already being processed.");
  } else {
    console.error(error);
    known = new AppError(
      "internal_error",
      500,
      "Something went wrong on our side. Please try again.",
    );
  }
  const body: ApiErrorBody = {
    error: {
      code: known.code,
      message: known.message,
      ...(known.fields ? { fields: known.fields } : {}),
    },
  };
  return Response.json(body, { status: known.status });
}

type Handler<P> = (
  request: Request,
  context: RequestContext,
  params: P,
) => Promise<Response> | Response;

/**
 * Wraps a route handler with the shared concerns: tenant resolution from the
 * workspace cookie, and one place where errors become JSON responses. Route
 * files stay a few lines each: parse, call a service, respond.
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (
    request: Request,
    segment: { params: Promise<P> },
  ): Promise<Response> => {
    // Read outside the try block: during a build Next.js signals "this route is
    // dynamic" by throwing here, and that signal must reach the framework.
    const cookieHeader = request.headers.get("cookie");
    try {
      const workspaceId = readCookie(cookieHeader, WORKSPACE_COOKIE);
      const context = await contextFor(workspaceId);
      return await handler(request, context, await segment.params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
