import { route } from "@/server/http/handler";
import { resetWorkspace } from "@/server/services/workspace";

/** Discards the visitor's changes and reseeds their demo company. */
export const POST = route(async (_request, { db, workspaceId, now }) => {
  await resetWorkspace(db, workspaceId, now);
  return Response.json({ ok: true });
});
