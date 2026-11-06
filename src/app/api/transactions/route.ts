import { transactionFiltersSchema } from "@/lib/contracts";
import { parseQuery, route } from "@/server/http/handler";
import { listTransactions } from "@/server/services/transactions";

export const GET = route(async (request, { db, workspaceId }) =>
  Response.json(
    await listTransactions(
      db,
      workspaceId,
      parseQuery(request, transactionFiltersSchema),
    ),
  ),
);
