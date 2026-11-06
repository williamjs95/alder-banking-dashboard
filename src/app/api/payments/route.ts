import { createPaymentSchema } from "@/lib/contracts";
import { parseBody, readIdempotencyKey, route } from "@/server/http/handler";
import { createPayment } from "@/server/services/payments";

export const POST = route(async (request, { db, workspaceId, now }) =>
  Response.json(
    await createPayment(
      db,
      workspaceId,
      await parseBody(request, createPaymentSchema),
      { now, idempotencyKey: readIdempotencyKey(request) },
    ),
    { status: 201 },
  ),
);
