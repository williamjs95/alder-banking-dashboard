import { route } from "@/server/http/handler";
import { getInsights } from "@/server/services/insights";

export const GET = route(async (_request, { db, workspaceId, now }) =>
  Response.json(await getInsights(db, workspaceId, now)),
);
