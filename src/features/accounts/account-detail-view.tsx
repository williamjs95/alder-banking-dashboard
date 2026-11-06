"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  BALANCE_RANGES,
  BalanceChart,
  balanceTable,
  sliceRange,
  type BalanceRange,
} from "@/components/charts/balance-chart";
import { ChartCard } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { StatTile } from "@/components/shared/stat-tile";
import { TransactionRow } from "@/components/shared/transaction-row";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ACCOUNT_TYPE_LABELS } from "@/lib/domain";
import { formatApy } from "@/lib/money";
import { accountQuery, transactionsQuery } from "@/lib/queries";
import { AccountNumbers } from "./account-numbers";

const RECENT_COUNT = 10;

/** One account: balance history, numbers, recent flow and latest activity. */
export function AccountDetailView({ accountId }: { accountId: string }) {
  const { data } = useSuspenseQuery(accountQuery(accountId));
  const { account, last30Days } = data;
  const [range, setRange] = useState<BalanceRange>("90");
  const series = sliceRange(data.balanceSeries, range);
  const recent = useQuery(
    transactionsQuery({ accountId, pageSize: RECENT_COUNT }),
  );

  return (
    <div className="grid gap-4">
      <div>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {account.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]} ••{account.last4}
          {account.apyBps > 0 && ` · ${formatApy(account.apyBps)} APY`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Available balance"
          className="lg:col-span-2"
          table={balanceTable(series)}
          actions={
            <SegmentedControl
              label="Balance history range"
              options={BALANCE_RANGES}
              value={range}
              onChange={setRange}
            />
          }
          description={
            <Money
              cents={account.balanceCents}
              className="mt-1 block text-3xl font-semibold tracking-tight text-foreground"
            />
          }
        >
          <BalanceChart data={series} />
        </ChartCard>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatTile
              label="Money in · 30 days"
              value={<Money cents={last30Days.inflowCents} whole />}
            />
            <StatTile
              label="Money out · 30 days"
              value={<Money cents={last30Days.outflowCents} whole />}
            />
          </div>
          <Card className="gap-3 px-5 py-4 shadow-none">
            <h2 className="text-sm font-medium">Account details</h2>
            <AccountNumbers accountId={account.id} last4={account.last4} />
          </Card>
        </div>
      </div>

      <Card className="gap-2 px-5 py-4 shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <Link
            href={`/transactions?accountId=${account.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {recent.isPending ? (
          <div className="grid gap-2 py-2" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.isError || recent.data.items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={
              recent.isError ? "Activity could not load" : "No activity yet"
            }
            description={
              recent.isError
                ? "Open the full transaction list to try again."
                : "Transactions on this account will show up here."
            }
          />
        ) : (
          <ul>
            {recent.data.items.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow transaction={transaction} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
