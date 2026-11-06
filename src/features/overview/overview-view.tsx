"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  CreditCard,
  ReceiptText,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  BALANCE_RANGES,
  BalanceChart,
  balanceTable,
  sliceRange,
  type BalanceRange,
} from "@/components/charts/balance-chart";
import {
  CashflowChart,
  cashflowTable,
} from "@/components/charts/cashflow-chart";
import { ChartCard } from "@/components/charts/chart-card";
import { RankedBars } from "@/components/charts/ranked-bars";
import { Delta } from "@/components/shared/delta";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { StatTile } from "@/components/shared/stat-tile";
import { TransactionRow } from "@/components/shared/transaction-row";
import { Card } from "@/components/ui/card";
import type { OverviewDto } from "@/lib/contracts";
import { addDays, dayKey, formatDate, parseDayKey } from "@/lib/dates";
import { ACCOUNT_TYPE_LABELS, CATEGORY_LABELS } from "@/lib/domain";
import { formatApy, formatMoney } from "@/lib/money";
import { overviewQuery } from "@/lib/queries";

const RANGE_LABELS: Record<BalanceRange, string> = {
  "30": "in the last 30 days",
  "90": "in the last 90 days",
  "365": "in the last year",
};
const PERIOD = "vs previous 30 days";
const QUICK_ACTIONS = [
  { href: "/payments?new=payment", label: "Send", icon: Send },
  { href: "/payments?new=transfer", label: "Transfer", icon: ArrowLeftRight },
  { href: "/cards?new=card", label: "New card", icon: CreditCard },
] as const;

function BalanceCard({ overview }: { overview: OverviewDto }) {
  const [range, setRange] = useState<BalanceRange>("90");
  const data = sliceRange(overview.balanceSeries, range);
  const start = data[0]?.balanceCents ?? overview.totalBalanceCents;
  const [dollars, cents] = formatMoney(overview.totalBalanceCents).split(".");

  return (
    <ChartCard
      title="Total balance"
      className="lg:col-span-2"
      table={balanceTable(data)}
      actions={
        <SegmentedControl
          label="Balance history range"
          options={BALANCE_RANGES}
          value={range}
          onChange={setRange}
        />
      }
      description={
        <>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {dollars}
            <span className="text-2xl text-muted-foreground sm:text-3xl">
              .{cents}
            </span>
          </p>
          <Delta
            className="mt-2"
            current={overview.totalBalanceCents}
            previous={start}
            goodWhen="up"
            label={RANGE_LABELS[range]}
          />
        </>
      }
    >
      <BalanceChart data={data} />
    </ChartCard>
  );
}

function AccountsCard({ accounts }: Pick<OverviewDto, "accounts">) {
  return (
    <Card className="h-full gap-3 px-5 py-4 shadow-none">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Accounts</h2>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="grid gap-1">
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/accounts/${account.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {account.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[account.type]} ••{account.last4}
                  {account.apyBps > 0 && ` · ${formatApy(account.apyBps)} APY`}
                </span>
              </span>
              <Money
                cents={account.balanceCents}
                className="text-sm font-medium"
              />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-4">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-xs font-medium outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-muted">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function SpendCard({ overview }: { overview: OverviewDto }) {
  const asOf = overview.balanceSeries.at(-1)?.date;
  const from = asOf ? dayKey(addDays(parseDayKey(asOf), -30)) : undefined;
  const total = overview.spendByCategory.reduce(
    (sum, row) => sum + row.cents,
    0,
  );

  return (
    <Card className="gap-3 px-5 py-4 shadow-none">
      <div>
        <h2 className="text-sm font-medium">Spend by category</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatMoney(total, { whole: true })} in the last 30 days
        </p>
      </div>
      {overview.spendByCategory.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No spend yet"
          description="Outgoing payments from the last 30 days will be grouped here."
        />
      ) : (
        <RankedBars
          items={overview.spendByCategory.slice(0, 7).map((row) => ({
            key: row.category,
            label: CATEGORY_LABELS[row.category],
            value: row.cents,
            display: formatMoney(row.cents, { whole: true }),
            href: `/transactions?category=${row.category}&direction=out${
              from ? `&from=${from}` : ""
            }`,
          }))}
        />
      )}
    </Card>
  );
}

function ListCard({
  title,
  href,
  children,
  className,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`gap-2 px-5 py-4 shadow-none ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {children}
    </Card>
  );
}

/** The landing page: cash position, how it is moving, and what needs attention. */
export function OverviewView() {
  const { data: overview } = useSuspenseQuery(overviewQuery);
  const { last30Days, previous30Days } = overview;
  const net = last30Days.inflowCents - last30Days.outflowCents;
  const burning = overview.runwayMonths !== null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <BalanceCard overview={overview} />
        <AccountsCard accounts={overview.accounts} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Money in · 30 days"
          value={<Money cents={last30Days.inflowCents} whole />}
          footer={
            <Delta
              current={last30Days.inflowCents}
              previous={previous30Days.inflowCents}
              goodWhen="up"
              label={PERIOD}
            />
          }
        />
        <StatTile
          label="Money out · 30 days"
          value={<Money cents={last30Days.outflowCents} whole />}
          footer={
            <Delta
              current={last30Days.outflowCents}
              previous={previous30Days.outflowCents}
              goodWhen="down"
              label={PERIOD}
            />
          }
        />
        <StatTile
          label="Net cash flow · 30 days"
          value={<Money cents={net} whole signed />}
          footer={
            <span className="text-xs text-muted-foreground">
              Excludes transfers between your accounts
            </span>
          }
        />
        <StatTile
          label="Runway"
          value={burning ? `${overview.runwayMonths} months` : "Not burning"}
          footer={
            <span className="text-xs text-muted-foreground">
              {burning
                ? `${formatMoney(overview.monthlyBurnCents, { whole: true })} average monthly burn`
                : "Cash flow positive over the last 3 months"}
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Cash flow"
          description="Money in and out per month, excluding internal transfers"
          className="lg:col-span-2"
          table={cashflowTable(overview.cashflow)}
        >
          <CashflowChart data={overview.cashflow} />
        </ChartCard>
        <SpendCard overview={overview} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard
          title="Recent transactions"
          href="/transactions"
          className="lg:col-span-2"
        >
          {overview.recent.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="No transactions yet"
              description="Activity on your accounts will show up here."
            />
          ) : (
            <ul>
              {overview.recent.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow transaction={transaction} />
                </li>
              ))}
            </ul>
          )}
        </ListCard>

        <ListCard
          title="Upcoming payments"
          href="/transactions?status=scheduled&order=asc"
        >
          {overview.upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              description="Payments you schedule for a future date will appear here."
            />
          ) : (
            <ul className="grid gap-1">
              {overview.upcoming.map((transaction) => (
                <li key={transaction.id}>
                  <Link
                    href={`/transactions?tx=${transaction.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {transaction.description}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Due {formatDate(transaction.postedAt)}
                      </span>
                    </span>
                    <Money
                      cents={transaction.amountCents}
                      className="text-sm font-medium"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      </div>
    </div>
  );
}
