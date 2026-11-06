"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABELS } from "@/lib/domain";
import { formatApy, formatMoney } from "@/lib/money";
import { accountsQuery } from "@/lib/queries";

/** All accounts with their balances; each opens its own detail page. */
export function AccountsView() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const total = accounts.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {formatMoney(total)} across {accounts.length} accounts
        </p>
        <Button asChild variant="outline" size="sm" className="bg-card">
          <Link href="/payments?new=transfer">
            <ArrowLeftRight aria-hidden="true" />
            Transfer between accounts
          </Link>
        </Button>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {accounts.map((account) => (
          <li key={account.id}>
            <Link
              href={`/accounts/${account.id}`}
              className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Card className="gap-6 px-5 py-5 shadow-none transition-colors group-hover:border-input">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">
                      {account.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[account.type]} ••{account.last4}
                    </p>
                  </div>
                  {account.apyBps > 0 && (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-brand-ink">
                      {formatApy(account.apyBps)} APY
                    </span>
                  )}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Available balance
                    </p>
                    <Money
                      cents={account.balanceCents}
                      className="text-2xl font-semibold tracking-tight"
                    />
                  </div>
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
