import { parseId, route } from "@/server/http/handler";
import { getAccountDetail } from "@/server/services/accounts";

export const GET = route<{ id: string }>(
  async (_request, { db, workspaceId, now }, { id }) =>
    Response.json(
      await getAccountDetail(db, workspaceId, parseId(id, "Account"), now),
    ),
);
