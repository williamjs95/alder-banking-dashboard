import { and, asc, eq } from "drizzle-orm";
import type { CreateRecipientInput, RecipientDto } from "@/lib/contracts";
import type { DbExecutor } from "@/server/db/client";
import { recipients, type RecipientRow } from "@/server/db/schema";
import { notFound } from "@/server/http/errors";

const toDto = (row: RecipientRow): RecipientDto => ({
  id: row.id,
  name: row.name,
  email: row.email,
  bankName: row.bankName,
  accountLast4: row.accountLast4,
  defaultMethod: row.defaultMethod,
  createdAt: row.createdAt.toISOString(),
});

export async function listRecipients(
  db: DbExecutor,
  workspaceId: string,
): Promise<RecipientDto[]> {
  const rows = await db
    .select()
    .from(recipients)
    .where(eq(recipients.workspaceId, workspaceId))
    .orderBy(asc(recipients.name), asc(recipients.id));
  return rows.map(toDto);
}

export async function getRecipientRow(
  db: DbExecutor,
  workspaceId: string,
  id: string,
): Promise<RecipientRow> {
  const [row] = await db
    .select()
    .from(recipients)
    .where(and(eq(recipients.workspaceId, workspaceId), eq(recipients.id, id)))
    .limit(1);
  if (!row) throw notFound("Recipient");
  return row;
}

export async function createRecipient(
  db: DbExecutor,
  workspaceId: string,
  input: CreateRecipientInput,
  now: Date,
): Promise<RecipientDto> {
  const [row] = await db
    .insert(recipients)
    .values({
      workspaceId,
      name: input.name,
      email: input.email ?? null,
      bankName: input.bankName,
      // Only the last four digits are kept; the demo never stores a full number.
      accountLast4: input.accountNumber.slice(-4),
      routingNumber: input.routingNumber,
      defaultMethod: input.defaultMethod,
      createdAt: now,
    })
    .returning();
  return toDto(row);
}
