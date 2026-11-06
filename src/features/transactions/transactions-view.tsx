"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { SearchX, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api-client";
import { accountsQuery, transactionsQuery } from "@/lib/queries";
import {
  clearedFilters,
  currentSort,
  hasActiveFilters,
  toggleSort,
} from "@/lib/transaction-filters";
import { FiltersBar } from "./filters-bar";
import { Pagination } from "./pagination";
import { TransactionSheet } from "./transaction-sheet";
import { TransactionsTable } from "./transactions-table";
import { useTransactionFilters } from "./use-transaction-filters";

function Summary({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

/** Transaction history with search, filters, sorting, paging, export and detail. */
export function TransactionsView() {
  const { filters, openId, update, replaceFilters } = useTransactionFilters();
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const list = useQuery(transactionsQuery(filters));
  const data = list.data;
  const filtered = hasActiveFilters(filters);

  return (
    <div className="grid gap-4">
      <FiltersBar
        filters={filters}
        accounts={accounts}
        onChange={update}
        onReplace={replaceFilters}
      />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        {data && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 border-b px-4 py-3">
            <Summary label={filtered ? "Matching" : "Transactions"}>
              <span className="tabular">
                {data.total.toLocaleString("en-US")}
              </span>
            </Summary>
            <Summary label="Money in">
              <Money cents={data.summary.inflowCents} tone />
            </Summary>
            <Summary label="Money out">
              <Money cents={-data.summary.outflowCents} />
            </Summary>
            <Summary label="Net">
              <Money cents={data.summary.netCents} signed />
            </Summary>
          </dl>
        )}

        {list.isError ? (
          <div role="alert" className="flex flex-col items-center px-6 py-12">
            <TriangleAlert
              className="mb-3 size-6 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">Transactions could not load</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage(list.error)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => list.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : !data ? (
          <div className="grid gap-2 p-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No transactions match"
            description="Try a broader search, a longer date range, or fewer filters."
            action={
              filtered && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => replaceFilters(clearedFilters(filters))}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <TransactionsTable
              transactions={data.items}
              sort={currentSort(filters)}
              onSort={(field) => update(toggleSort(filters, field))}
              onOpen={(id) => update({ tx: id })}
              dimmed={list.isPlaceholderData}
            />
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(page) => update({ page: String(page) })}
              onPageSize={(size) => update({ pageSize: String(size) })}
            />
          </>
        )}
      </Card>

      <TransactionSheet
        id={openId}
        seed={data?.items.find((item) => item.id === openId)}
        onClose={() => update({ tx: undefined })}
      />
    </div>
  );
}
