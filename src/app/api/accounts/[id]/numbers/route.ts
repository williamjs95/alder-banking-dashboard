import { parseId, route } from "@/server/http/handler";
import { getAccountNumbers } from "@/server/services/accounts";

export const GET = route<{ id: string }>(
  async (_request, { db, workspaceId }, { id }) =>
    Response.json(
      await getAccountNumbers(db, workspaceId, parseId(id, "Account")),
      // Sensitive: never let a shared cache keep a copy.
      { headers: { "Cache-Control": "no-store" } },
    ),
);
