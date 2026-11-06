import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { TransactionsView } from "@/features/transactions/transactions-view";
import { transactionFiltersSchema } from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { readFilters } from "@/lib/transaction-filters";
import { Hydrate } from "@/server/hydrate";
import { listAccounts } from "@/server/services/accounts";
import { listTransactions } from "@/server/services/transactions";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Transactions" };

type SearchParams = PageProps<"/transactions">["searchParams"];

async function TransactionsData({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = readFilters((key) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  });
  const { db, workspaceId } = await getRequestContext();
  const [list, accounts] = await Promise.all([
    listTransactions(db, workspaceId, transactionFiltersSchema.parse(filters)),
    listAccounts(db, workspaceId),
  ]);
  return (
    <Hydrate
      entries={[
        [queryKeys.transactions(filters), list],
        [queryKeys.accounts, accounts],
      ]}
    >
      <TransactionsView />
    </Hydrate>
  );
}

export default function TransactionsPage({
  searchParams,
}: PageProps<"/transactions">) {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every movement across your accounts. Search, filter and export."
      />
      <Suspense fallback={<PageSkeleton label="Loading transactions" />}>
        <TransactionsData searchParams={searchParams} />
      </Suspense>
    </>
  );
}
