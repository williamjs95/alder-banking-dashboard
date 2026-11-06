import { updateTransactionSchema } from "@/lib/contracts";
import { parseBody, parseId, route } from "@/server/http/handler";
import {
  getTransaction,
  updateTransaction,
} from "@/server/services/transactions";

export const GET = route<{ id: string }>(
  async (_request, { db, workspaceId }, { id }) =>
    Response.json(
      await getTransaction(db, workspaceId, parseId(id, "Transaction")),
    ),
);

export const PATCH = route<{ id: string }>(
  async (request, { db, workspaceId }, { id }) =>
    Response.json(
      await updateTransaction(
        db,
        workspaceId,
        parseId(id, "Transaction"),
        await parseBody(request, updateTransactionSchema),
      ),
    ),
);
