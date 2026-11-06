// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  NOW,
  OTHER_WORKSPACE_ID,
  WORKSPACE_ID,
} from "../../../test/db";
import { UNKNOWN_ID } from "../../../test/server-http";
import { addRecipient, addWorkspace, utc } from "../../../test/server-ledger";
import { createRecipientSchema } from "@/lib/contracts";
import type { Db } from "@/server/db/client";
import { recipients, workspaces } from "@/server/db/schema";
import { createRecipient, getRecipientRow, listRecipients } from "./recipients";

let db: Db;

const notFound = {
  code: "not_found",
  status: 404,
  message: "Recipient was not found.",
};

/** Input as it reaches the service: already validated by the API schema. */
const input = (overrides: Record<string, unknown> = {}) =>
  createRecipientSchema.parse({
    name: "Oakline Design Studio",
    email: "hello@oakline.example",
    bankName: "Bank of America",
    routingNumber: "026009593",
    accountNumber: "000123456789",
    ...overrides,
  });

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(workspaces);
  await addWorkspace(db, WORKSPACE_ID);
  await addWorkspace(db, OTHER_WORKSPACE_ID);
});

describe("listRecipients", () => {
  it("lists recipients alphabetically without their routing numbers", async () => {
    const zenith = await addRecipient(db, WORKSPACE_ID, {
      name: "Zenith Freight",
      email: null,
      defaultMethod: "wire",
      createdAt: utc("2026-01-05T09:00:00"),
    });
    const acme = await addRecipient(db, WORKSPACE_ID, {
      name: "Acme Supplies",
    });
    await addRecipient(db, WORKSPACE_ID, { name: "Birch & Co" });

    const list = await listRecipients(db, WORKSPACE_ID);

    expect(list.map((recipient) => recipient.name)).toEqual([
      "Acme Supplies",
      "Birch & Co",
      "Zenith Freight",
    ]);
    expect(list[0]).toEqual({
      id: acme.id,
      name: "Acme Supplies",
      email: "billing@acme.example",
      bankName: "First Test Bank",
      accountLast4: "4321",
      defaultMethod: "ach",
      createdAt: NOW.toISOString(),
    });
    expect(list[2]).toEqual({
      id: zenith.id,
      name: "Zenith Freight",
      email: null,
      bankName: "First Test Bank",
      accountLast4: "4321",
      defaultMethod: "wire",
      createdAt: "2026-01-05T09:00:00.000Z",
    });
  });

  it("is empty for a workspace without recipients", async () => {
    expect(await listRecipients(db, WORKSPACE_ID)).toEqual([]);
  });

  it("shows each workspace only its own recipients", async () => {
    await addRecipient(db, WORKSPACE_ID, { name: "Mine" });
    await addRecipient(db, OTHER_WORKSPACE_ID, { name: "Theirs" });

    expect(
      (await listRecipients(db, WORKSPACE_ID)).map((row) => row.name),
    ).toEqual(["Mine"]);
    expect(
      (await listRecipients(db, OTHER_WORKSPACE_ID)).map((row) => row.name),
    ).toEqual(["Theirs"]);
  });
});

describe("getRecipientRow", () => {
  it("returns the stored row", async () => {
    const recipient = await addRecipient(db, WORKSPACE_ID);

    expect(await getRecipientRow(db, WORKSPACE_ID, recipient.id)).toEqual(
      recipient,
    );
  });

  it("reports an unknown id as not found", async () => {
    await expect(
      getRecipientRow(db, WORKSPACE_ID, UNKNOWN_ID),
    ).rejects.toMatchObject(notFound);
  });

  it("reports another workspace's recipient as not found", async () => {
    const theirs = await addRecipient(db, OTHER_WORKSPACE_ID);

    await expect(
      getRecipientRow(db, WORKSPACE_ID, theirs.id),
    ).rejects.toMatchObject(notFound);
  });
});

describe("createRecipient", () => {
  it("saves the recipient and returns it as the API shows it", async () => {
    const created = await createRecipient(db, WORKSPACE_ID, input(), NOW);

    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: "Oakline Design Studio",
      email: "hello@oakline.example",
      bankName: "Bank of America",
      accountLast4: "6789",
      defaultMethod: "ach",
      createdAt: NOW.toISOString(),
    });
    expect(await listRecipients(db, WORKSPACE_ID)).toEqual([created]);
  });

  it("keeps only the last four digits of the account number", async () => {
    const created = await createRecipient(
      db,
      WORKSPACE_ID,
      input({ accountNumber: "98765432101234567" }),
      NOW,
    );
    const [stored] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.id, created.id));

    expect(stored.accountLast4).toBe("4567");
    expect(stored.routingNumber).toBe("026009593");
    expect(JSON.stringify(stored)).not.toContain("98765432101234567");
  });

  it("stores a missing or blank email as null", async () => {
    const withoutEmail = await createRecipient(
      db,
      WORKSPACE_ID,
      input({ email: undefined }),
      NOW,
    );
    const blankEmail = await createRecipient(
      db,
      WORKSPACE_ID,
      input({ email: "" }),
      NOW,
    );

    expect(withoutEmail.email).toBeNull();
    expect(blankEmail.email).toBeNull();
  });

  it("remembers a wire preference", async () => {
    const created = await createRecipient(
      db,
      WORKSPACE_ID,
      input({ defaultMethod: "wire" }),
      NOW,
    );

    expect(created.defaultMethod).toBe("wire");
  });

  it("adds the recipient to the caller's workspace only", async () => {
    const created = await createRecipient(db, WORKSPACE_ID, input(), NOW);

    expect(await listRecipients(db, OTHER_WORKSPACE_ID)).toEqual([]);
    await expect(
      getRecipientRow(db, OTHER_WORKSPACE_ID, created.id),
    ).rejects.toMatchObject(notFound);
  });
});
