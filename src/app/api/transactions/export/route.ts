import { transactionFiltersSchema } from "@/lib/contracts";
import { safeText, toCsv } from "@/lib/csv";
import { dayKey } from "@/lib/dates";
import { CATEGORY_LABELS, METHOD_LABELS, STATUS_LABELS } from "@/lib/domain";
import { parseQuery, route } from "@/server/http/handler";
import { exportTransactions } from "@/server/services/transactions";

const HEADER = [
  "Date",
  "Description",
  "Amount",
  "Status",
  "Category",
  "Method",
  "Account",
  "Reference",
  "Note",
] as const;

/** Downloads every transaction matching the current filters as CSV. */
export const GET = route(async (request, { db, workspaceId, now }) => {
  const filters = parseQuery(request, transactionFiltersSchema);
  const rows = await exportTransactions(db, workspaceId, filters);
  const csv = toCsv(
    HEADER,
    rows.map((row) => [
      row.postedAt.slice(0, 10),
      safeText(row.description),
      (row.amountCents / 100).toFixed(2),
      STATUS_LABELS[row.status],
      CATEGORY_LABELS[row.category],
      METHOD_LABELS[row.method],
      row.accountName,
      row.reference,
      row.note ? safeText(row.note) : null,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alder-transactions-${dayKey(now)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
