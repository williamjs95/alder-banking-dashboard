import { createTransferSchema } from "@/lib/contracts";
import { parseBody, readIdempotencyKey, route } from "@/server/http/handler";
import { createTransfer } from "@/server/services/payments";

export const POST = route(async (request, { db, workspaceId, now }) =>
  Response.json(
    await createTransfer(
      db,
      workspaceId,
      await parseBody(request, createTransferSchema),
      { now, idempotencyKey: readIdempotencyKey(request) },
    ),
    { status: 201 },
  ),
);
