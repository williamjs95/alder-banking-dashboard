import { route } from "@/server/http/handler";
import { getOverview } from "@/server/services/overview";

export const GET = route(async (_request, { db, workspaceId, now }) =>
  Response.json(await getOverview(db, workspaceId, now)),
);
