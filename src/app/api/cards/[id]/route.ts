import { updateCardSchema } from "@/lib/contracts";
import { parseBody, parseId, route } from "@/server/http/handler";
import { updateCard } from "@/server/services/cards";

export const PATCH = route<{ id: string }>(
  async (request, { db, workspaceId, now }, { id }) =>
    Response.json(
      await updateCard(
        db,
        workspaceId,
        parseId(id, "Card"),
        await parseBody(request, updateCardSchema),
        now,
      ),
    ),
);
