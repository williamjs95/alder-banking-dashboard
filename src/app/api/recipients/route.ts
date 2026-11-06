import { createRecipientSchema } from "@/lib/contracts";
import { parseBody, route } from "@/server/http/handler";
import { createRecipient, listRecipients } from "@/server/services/recipients";

export const GET = route(async (_request, { db, workspaceId }) =>
  Response.json(await listRecipients(db, workspaceId)),
);

export const POST = route(async (request, { db, workspaceId, now }) =>
  Response.json(
    await createRecipient(
      db,
      workspaceId,
      await parseBody(request, createRecipientSchema),
      now,
    ),
    { status: 201 },
  ),
);
