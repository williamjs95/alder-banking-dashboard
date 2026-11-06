import { createCardSchema } from "@/lib/contracts";
import { parseBody, route } from "@/server/http/handler";
import { createCard, listCards } from "@/server/services/cards";

export const GET = route(async (_request, { db, workspaceId, now }) =>
  Response.json(await listCards(db, workspaceId, now)),
);

export const POST = route(async (request, { db, workspaceId, now }) =>
  Response.json(
    await createCard(
      db,
      workspaceId,
      await parseBody(request, createCardSchema),
      now,
    ),
    { status: 201 },
  ),
);
