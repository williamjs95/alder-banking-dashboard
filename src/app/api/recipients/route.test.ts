// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "../../../../test/db";
import {
  apiRequest,
  errorOf,
  noParams,
  setupSeededRouteDb,
} from "../../../../test/server-http";
import type { RecipientDto } from "@/lib/contracts";
import { GET, POST } from "./route";

vi.mock("@/server/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/db/client")>()),
  getDb: vi.fn(),
}));

setupSeededRouteDb();

const list = async (workspaceId: string = WORKSPACE_ID) =>
  (await (
    await GET(apiRequest("/api/recipients", { workspaceId }), noParams)
  ).json()) as RecipientDto[];

const create = (json: unknown, workspaceId: string | null = WORKSPACE_ID) =>
  POST(
    apiRequest("/api/recipients", { method: "POST", json, workspaceId }),
    noParams,
  );

const validRecipient = (overrides: Record<string, unknown> = {}) => ({
  name: "Northwind Traders",
  email: "ap@northwind.example",
  bankName: "Chase",
  routingNumber: "021000021",
  accountNumber: "000123456789",
  ...overrides,
});

describe("GET /api/recipients", () => {
  it("lists the workspace's recipients alphabetically", async () => {
    const response = await GET(apiRequest("/api/recipients"), noParams);
    const recipients = (await response.json()) as RecipientDto[];

    expect(response.status).toBe(200);
    expect(
      recipients.map((row) => [row.name, row.defaultMethod, row.accountLast4]),
    ).toEqual([
      ["Gunderson Dettmer LLP", "wire", "7715"],
      ["Hartwell Staffing", "ach", "2258"],
      ["Kestrel Analytics", "wire", "9012"],
      ["Oakline Design Studio", "ach", "6640"],
      ["Pilot.com, Inc.", "ach", "4406"],
      ["WeWork · 600 Congress Ave", "ach", "0931"],
    ]);
    expect(recipients[2].email).toBeNull();
  });

  it("does not expose routing numbers", async () => {
    const recipients = await list();

    for (const recipient of recipients) {
      expect(Object.keys(recipient).sort()).toEqual([
        "accountLast4",
        "bankName",
        "createdAt",
        "defaultMethod",
        "email",
        "id",
        "name",
      ]);
    }
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await GET(
      apiRequest("/api/recipients", { workspaceId: null }),
      noParams,
    );

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("no_workspace");
  });
});

describe("POST /api/recipients", () => {
  it("saves a recipient and answers 201 with it", async () => {
    const response = await create(validRecipient());
    const recipient = (await response.json()) as RecipientDto;

    expect(response.status).toBe(201);
    expect(recipient).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Northwind Traders",
      email: "ap@northwind.example",
      bankName: "Chase",
      accountLast4: "6789",
      defaultMethod: "ach",
      createdAt: "2026-06-18T16:30:00.000Z",
    });
    expect(await list()).toContainEqual(recipient);
  });

  it("never echoes the full account number back", async () => {
    const response = await create(
      validRecipient({
        name: "Secretive LLC",
        accountNumber: "12345678901234567",
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(201);
    expect(text).not.toContain("12345678901234567");
    expect(JSON.parse(text).accountLast4).toBe("4567");
  });

  it("accepts a wire preference, a blank email and padded text", async () => {
    const response = await create(
      validRecipient({
        name: "  Padded Name  ",
        email: "",
        defaultMethod: "wire",
        routingNumber: " 021000021 ",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: "Padded Name",
      email: null,
      defaultMethod: "wire",
    });
  });

  it("answers 422 with a message per invalid field and saves nothing", async () => {
    const before = await list();

    const response = await create({
      name: "A",
      email: "not-an-email",
      bankName: "",
      routingNumber: "12345",
      accountNumber: "12-34",
      defaultMethod: "pigeon",
    });

    expect(response.status).toBe(422);
    const error = await errorOf(response);
    expect(error.code).toBe("validation_error");
    expect(error.fields).toMatchObject({
      name: "Enter the recipient's name",
      bankName: "Enter the bank name",
      routingNumber: "Routing numbers have 9 digits",
      accountNumber: "Account numbers have 6 to 17 digits",
    });
    expect(Object.keys(error.fields ?? {}).sort()).toEqual([
      "accountNumber",
      "bankName",
      "defaultMethod",
      "email",
      "name",
      "routingNumber",
    ]);
    expect(await list()).toEqual(before);
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await POST(
      apiRequest("/api/recipients", { method: "POST", rawBody: "name=Acme" }),
      noParams,
    );

    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: "bad_request",
      message: "The request body is not JSON.",
    });
  });

  it("keeps a new recipient private to the workspace that added it", async () => {
    const response = await create(
      validRecipient({ name: "Only for the other visitor" }),
      OTHER_WORKSPACE_ID,
    );

    expect(response.status).toBe(201);
    expect((await list(OTHER_WORKSPACE_ID)).map((row) => row.name)).toContain(
      "Only for the other visitor",
    );
    expect((await list()).map((row) => row.name)).not.toContain(
      "Only for the other visitor",
    );
  });

  it("answers 401 without a workspace cookie", async () => {
    const response = await create(validRecipient(), null);

    expect(response.status).toBe(401);
  });
});
