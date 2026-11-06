import { route } from "@/server/http/handler";
import { listAccounts } from "@/server/services/accounts";

export const GET = route(async (_request, { db, workspaceId }) =>
  Response.json(await listAccounts(db, workspaceId)),
);
