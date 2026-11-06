import Link from "next/link";
import type { TransactionDto } from "@/lib/contracts";
import { formatDate } from "@/lib/dates";
import { METHOD_LABELS } from "@/lib/domain";
import { MerchantAvatar } from "./merchant-avatar";
import { Money } from "./money";
import { StatusBadge } from "./status-badge";

/** A compact transaction line that opens the transaction's detail. */
export function TransactionRow({
  transaction,
}: {
  transaction: TransactionDto;
}) {
  return (
    <Link
      href={`/transactions?tx=${transaction.id}`}
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <MerchantAvatar category={transaction.category} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {transaction.description}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatDate(transaction.postedAt)}
          <span className="sr-only">, </span>
          <span aria-hidden="true" className="h-3 w-px bg-border" />
          {METHOD_LABELS[transaction.method]}
          {transaction.status !== "posted" && (
            <>
              <span className="sr-only">, </span>
              <span aria-hidden="true" className="h-3 w-px bg-border" />
              <StatusBadge status={transaction.status} />
            </>
          )}
        </span>
      </span>
      <Money
        cents={transaction.amountCents}
        signed
        tone
        className="text-sm font-medium"
      />
    </Link>
  );
}
