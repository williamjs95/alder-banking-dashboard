// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTestDb, NOW, WORKSPACE_ID } from "../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  segment,
} from "../../../test/server-http";
import { countRows } from "../../../test/server-ledger";
import { getDb, type Db } from "@/server/db/client";
import { accounts, transactions, workspaces } from "@/server/db/schema";
import { AppError, invalid } from "./errors";
import {
  contextFor,
  errorResponse,
  parseBody,
  parseId,
  parseQuery,
  readCookie,
  readIdempotencyKey,
  route,
  type RequestContext,
} from "./handler";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

/** Runs `action` and returns the AppError it throws. */
async function thrownBy(action: () => unknown): Promise<AppError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Expected an AppError, but nothing was thrown.");
}

const post = (body: string) =>
  new Request("http://test/api/things", { method: "POST", body });

let db: Db;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.mocked(getDb).mockReset().mockResolvedValue(db);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await db.delete(workspaces);
});

afterEach(() => {
  consoleError.mockRestore();
});

afterAll(() => {
  vi.useRealTimers();
});

describe("readCookie", () => {
  it("returns null when there is no cookie header", () => {
    expect(readCookie(null, "alder_workspace")).toBeNull();
    expect(readCookie("", "alder_workspace")).toBeNull();
  });

  it("finds a cookie among several, ignoring surrounding spaces", () => {
    const header = "theme=dark;  alder_workspace = abc123 ; other=1";

    expect(readCookie(header, "alder_workspace")).toBe("abc123");
    expect(readCookie(header, "theme")).toBe("dark");
  });

  it("URL-decodes the value", () => {
    expect(readCookie("name=Maya%20Chen%3B%20CEO", "name")).toBe(
      "Maya Chen; CEO",
    );
  });

  it("keeps everything after the first equals sign", () => {
    expect(readCookie("token=a=b=c", "token")).toBe("a=b=c");
  });

  it("returns null for a cookie that is not present", () => {
    expect(readCookie("theme=dark", "alder_workspace")).toBeNull();
  });

  it("matches the whole name, not a prefix or suffix of it", () => {
    expect(
      readCookie(
        "xalder_workspace=1; alder_workspace_old=2",
        "alder_workspace",
      ),
    ).toBeNull();
  });

  it("skips fragments that are not name=value pairs", () => {
    expect(readCookie("garbage; alder_workspace=abc", "alder_workspace")).toBe(
      "abc",
    );
    expect(readCookie("alder_workspace", "alder_workspace")).toBeNull();
  });

  it("returns null for a value with a malformed percent-escape", () => {
    expect(
      readCookie("alder_workspace=%E0%A4%A", "alder_workspace"),
    ).toBeNull();
    expect(readCookie("alder_workspace=%", "alder_workspace")).toBeNull();
  });

  it("returns the first match when a name is repeated", () => {
    expect(readCookie("id=first; id=second", "id")).toBe("first");
  });
});

describe("contextFor", () => {
  it.each([undefined, null, "", "not-a-uuid", "1234"])(
    "rejects the workspace id %j with a 401 before touching the database",
    async (value) => {
      const error = await thrownBy(() => contextFor(value));

      expect(error).toMatchObject({
        code: "no_workspace",
        status: 401,
        message:
          "Your demo session was not found. Reload the page to start a new one.",
      });
      expect(getDb).not.toHaveBeenCalled();
    },
  );

  it("returns the database, the workspace and the current time", async () => {
    const context = await contextFor(WORKSPACE_ID);

    expect(context.db).toBe(db);
    expect(context.workspaceId).toBe(WORKSPACE_ID);
    expect(context.now).toEqual(NOW);
  });

  it("settles what is due before the request reads anything", async () => {
    await contextFor(WORKSPACE_ID);
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, WORKSPACE_ID));
    const [row] = await db
      .insert(transactions)
      .values({
        workspaceId: WORKSPACE_ID,
        accountId: account.id,
        postedAt: NOW,
        description: "Settled by the next request",
        amountCents: -1_00,
        category: "other",
        method: "ach",
        status: "pending",
        settlesAt: NOW,
        reference: "ALD-SETTLE01",
      })
      .returning({ id: transactions.id });

    await contextFor(WORKSPACE_ID);

    const [settled] = await db
      .select({ status: transactions.status })
      .from(transactions)
      .where(eq(transactions.id, row.id));
    expect(settled.status).toBe("posted");
  });

  it("seeds the demo company the first time a workspace is seen, and only then", async () => {
    await contextFor(WORKSPACE_ID);
    const seeded = await countRows(db, transactions, WORKSPACE_ID);

    await contextFor(WORKSPACE_ID);

    expect(await countRows(db, accounts, WORKSPACE_ID)).toBe(3);
    expect(seeded).toBeGreaterThan(800);
    expect(await countRows(db, transactions, WORKSPACE_ID)).toBe(seeded);
  });
});

describe("parseQuery", () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().trim().optional(),
  });

  it("parses, coerces and applies defaults to the query string", () => {
    const request = new Request("http://test/api/things?page=3&q=%20rent%20");

    expect(parseQuery(request, schema)).toEqual({ page: 3, q: "rent" });
    expect(parseQuery(new Request("http://test/api/things"), schema)).toEqual({
      page: 1,
    });
  });

  it("rejects an invalid query with a 422 naming the field", async () => {
    const request = new Request("http://test/api/things?page=0");
    const error = await thrownBy(() => parseQuery(request, schema));

    expect(error).toMatchObject({
      code: "validation_error",
      status: 422,
      message: "Some fields need attention.",
    });
    expect(Object.keys(error.fields ?? {})).toEqual(["page"]);
  });
});

describe("parseBody", () => {
  const schema = z
    .object({
      name: z.string().trim().min(2, "Too short").regex(/^\D+$/, "No digits"),
      address: z.object({ zip: z.string().length(5, "Five digits") }),
      confirm: z.string().optional(),
    })
    .refine((value) => value.confirm !== "no", { message: "Must confirm" });

  it("returns the parsed, transformed body", async () => {
    const request = post(
      JSON.stringify({ name: "  Maya  ", address: { zip: "78701" } }),
    );

    expect(await parseBody(request, schema)).toEqual({
      name: "Maya",
      address: { zip: "78701" },
    });
  });

  it.each(["{not json", "", "undefined"])(
    "rejects the malformed body %j with a 400",
    async (body) => {
      const error = await thrownBy(() => parseBody(post(body), schema));

      expect(error).toMatchObject({
        code: "bad_request",
        status: 400,
        message: "The request body is not JSON.",
      });
      expect(error.fields).toBeUndefined();
    },
  );

  it("reports nested fields by dotted path and keeps the first message per field", async () => {
    const request = post(JSON.stringify({ name: "7", address: { zip: "1" } }));
    const error = await thrownBy(() => parseBody(request, schema));

    expect(error.status).toBe(422);
    expect(error.fields).toEqual({
      name: "Too short",
      "address.zip": "Five digits",
    });
  });

  it("files a whole-form problem under the underscore key", async () => {
    const request = post(
      JSON.stringify({
        name: "Maya",
        address: { zip: "78701" },
        confirm: "no",
      }),
    );
    const error = await thrownBy(() => parseBody(request, schema));

    expect(error.fields).toEqual({ _: "Must confirm" });
  });

  it("rejects JSON of the wrong shape, such as null or an array", async () => {
    for (const body of ["null", "[]", '"text"']) {
      const error = await thrownBy(() => parseBody(post(body), schema));
      expect(error.status).toBe(422);
      expect(error.fields).toHaveProperty("_");
    }
  });
});

describe("parseId", () => {
  it("returns a well-formed id unchanged", () => {
    expect(parseId(WORKSPACE_ID, "Card")).toBe(WORKSPACE_ID);
  });

  it.each(["", "42", "not-a-uuid", `${WORKSPACE_ID}x`, "' or 1=1 --"])(
    "treats the malformed id %j as a missing resource",
    async (value) => {
      const error = await thrownBy(() => parseId(value, "Card"));

      expect(error).toMatchObject({
        code: "not_found",
        status: 404,
        message: "Card was not found.",
      });
    },
  );
});

describe("readIdempotencyKey", () => {
  const withKey = (key: string) =>
    new Request("http://test/api/payments", {
      method: "POST",
      headers: { "Idempotency-Key": key },
    });

  it("is undefined when the header is absent or blank", () => {
    expect(
      readIdempotencyKey(new Request("http://test/api/payments")),
    ).toBeUndefined();
    expect(readIdempotencyKey(withKey("   "))).toBeUndefined();
  });

  it("returns the key without surrounding whitespace", () => {
    expect(readIdempotencyKey(withKey("  pay-2026-06-18-001  "))).toBe(
      "pay-2026-06-18-001",
    );
  });

  it("accepts keys up to 100 characters", () => {
    expect(readIdempotencyKey(withKey("k".repeat(100)))).toBe("k".repeat(100));
  });

  it("rejects keys longer than 100 characters with a 400", async () => {
    const error = await thrownBy(() =>
      readIdempotencyKey(withKey("k".repeat(101))),
    );

    expect(error).toMatchObject({
      code: "bad_request",
      status: 400,
      message: "Idempotency-Key is too long.",
    });
  });
});

describe("errorResponse", () => {
  it("turns an AppError into JSON with its own status, code and message", async () => {
    const response = errorResponse(new AppError("not_found", 404, "Gone."));

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Gone." },
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("includes field messages when the error has them", async () => {
    const response = errorResponse(invalid("Fix it.", { name: "Required" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Fix it.",
        fields: { name: "Required" },
      },
    });
  });

  it("maps a Postgres unique violation to 409 Conflict", async () => {
    const violation = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    const response = errorResponse(violation);

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toEqual({
      code: "conflict",
      message: "This request is already being processed.",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("recognises a unique violation wrapped by the ORM as the cause", async () => {
    const wrapped = new Error("Failed query: insert into transactions", {
      cause: Object.assign(new Error("duplicate key value"), { code: "23505" }),
    });
    const response = errorResponse(wrapped);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("conflict");
  });

  it.each([
    [
      "another Postgres error",
      Object.assign(new Error("fk"), { code: "23503" }),
    ],
    ["a numeric code", { code: 23505 }],
    ["a plain Error", new Error("connection reset by peer")],
    ["a thrown string", "boom"],
    ["null", null],
    ["undefined", undefined],
  ])(
    "answers %s with a generic 500 and logs the original",
    async (_label, thrown) => {
      const response = errorResponse(thrown);

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "internal_error",
          message: "Something went wrong on our side. Please try again.",
        },
      });
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(thrown);
    },
  );
});

describe("route", () => {
  it("gives the handler the request, the visitor's context and the route params", async () => {
    let seen: { context: RequestContext; params: { id: string } } | undefined;
    const GET = route<{ id: string }>(async (request, context, params) => {
      seen = { context, params };
      return Response.json({ path: new URL(request.url).pathname });
    });

    const response = await GET(
      apiRequest("/api/things/7"),
      segment({ id: "7" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: "/api/things/7" });
    expect(seen?.params).toEqual({ id: "7" });
    expect(seen?.context.workspaceId).toBe(WORKSPACE_ID);
    expect(seen?.context.db).toBe(db);
    expect(seen?.context.now).toEqual(NOW);
  });

  it("seeds a new visitor's workspace before the handler runs", async () => {
    const GET = route(async (_request, context) =>
      Response.json({
        accounts: await countRows(context.db, accounts, context.workspaceId),
      }),
    );

    const response = await GET(apiRequest("/api/things"), noParams);

    expect(await response.json()).toEqual({ accounts: 3 });
  });

  it("accepts a handler that responds synchronously", async () => {
    const GET = route(() => new Response("pong", { status: 202 }));

    const response = await GET(apiRequest("/api/ping"), noParams);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("pong");
  });

  it("finds the workspace cookie among other cookies", async () => {
    const GET = route((_request, context) =>
      Response.json({ workspaceId: context.workspaceId }),
    );
    const request = new Request("http://test/api/things", {
      headers: { cookie: `theme=dark; alder_workspace=${WORKSPACE_ID}; n=1` },
    });

    expect(await (await GET(request, noParams)).json()).toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });

  it.each([
    ["no cookie at all", apiRequest("/api/things", { workspaceId: null })],
    [
      "a malformed workspace id",
      apiRequest("/api/things", { workspaceId: "nope" }),
    ],
    [
      "only unrelated cookies",
      new Request("http://test/api/things", {
        headers: { cookie: "theme=dark" },
      }),
    ],
  ])(
    "answers 401 without running the handler for %s",
    async (_label, request) => {
      const handler = vi.fn(() => Response.json({ ok: true }));

      const response = await route(handler)(request, noParams);

      expect(response.status).toBe(401);
      expect(await errorOf(response)).toEqual({
        code: "no_workspace",
        message:
          "Your demo session was not found. Reload the page to start a new one.",
      });
      expect(handler).not.toHaveBeenCalled();
      expect(getDb).not.toHaveBeenCalled();
    },
  );

  it("answers 401, not 500, for a workspace cookie that cannot be decoded", async () => {
    const handler = vi.fn(() => Response.json({ ok: true }));
    const request = new Request("http://test/api/things", {
      headers: { cookie: "alder_workspace=%E0%A4%A" },
    });

    const response = await route(handler)(request, noParams);

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
    expect(handler).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("turns an AppError thrown by the handler into its JSON response", async () => {
    const POST = route(() => {
      throw invalid("Some fields need attention.", { amountCents: "Too big" });
    });

    const response = await POST(apiRequest("/api/things"), noParams);

    expect(response.status).toBe(422);
    expect(await errorOf(response)).toEqual({
      code: "validation_error",
      message: "Some fields need attention.",
      fields: { amountCents: "Too big" },
    });
  });

  it("turns a unique violation raised inside the handler into a 409", async () => {
    const POST = route(async () => {
      throw new Error("Failed query", { cause: { code: "23505" } });
    });

    const response = await POST(apiRequest("/api/things"), noParams);

    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("conflict");
  });

  it("hides the details of an unexpected failure behind a 500", async () => {
    const failure = new Error("password authentication failed for user alder");
    const GET = route(async () => {
      throw failure;
    });

    const response = await GET(apiRequest("/api/things"), noParams);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("password");
    expect(JSON.parse(text).error.code).toBe("internal_error");
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("answers 500 when the database cannot be opened", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("DATABASE_URL is not set."));
    const handler = vi.fn(() => Response.json({ ok: true }));

    const response = await route(handler)(apiRequest("/api/things"), noParams);

    expect(response.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets an error from reading the request headers escape to the framework", async () => {
    // Next.js signals "this route is dynamic" during a build by throwing here.
    const signal = new Error("DYNAMIC_SERVER_USAGE");
    const request = {
      headers: {
        get() {
          throw signal;
        },
      },
    } as unknown as Request;
    const handler = vi.fn(() => Response.json({ ok: true }));

    await expect(route(handler)(request, noParams)).rejects.toBe(signal);
    expect(handler).not.toHaveBeenCalled();
  });
});
