"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, StickyNote } from "lucide-react";
import { MerchantAvatar } from "@/components/shared/merchant-avatar";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SortField, TransactionDto } from "@/lib/contracts";
import { formatDateWithYear } from "@/lib/dates";
import { CATEGORY_LABELS, METHOD_LABELS } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Sort = { sort: SortField; order: "asc" | "desc" };

function SortHeader({
  field,
  label,
  current,
  onSort,
  align = "left",
}: {
  field: SortField;
  label: string;
  current: Sort;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const active = current.sort === field;
  const Icon = !active
    ? ChevronsUpDown
    : current.order === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <TableHead
      aria-sort={
        active ? (current.order === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

/**
 * The ledger. A table from the `md` breakpoint up; below it, the same rows as a
 * stacked list, because six columns do not fit a phone.
 */
export function TransactionsTable({
  transactions,
  sort,
  onSort,
  onOpen,
  dimmed,
}: {
  transactions: readonly TransactionDto[];
  sort: Sort;
  onSort: (field: SortField) => void;
  onOpen: (id: string) => void;
  /** True while the next page or filter is loading: keep the rows, fade them. */
  dimmed: boolean;
}) {
  return (
    <div
      className={cn("transition-opacity", dimmed && "opacity-60")}
      aria-busy={dimmed}
    >
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHeader
              field="date"
              label="Date"
              current={sort}
              onSort={onSort}
            />
            <SortHeader
              field="description"
              label="Description"
              current={sort}
              onSort={onSort}
            />
            <TableHead className="hidden lg:table-cell">Category</TableHead>
            <TableHead className="hidden xl:table-cell">Account</TableHead>
            <TableHead>Status</TableHead>
            <SortHeader
              field="amount"
              label="Amount"
              current={sort}
              onSort={onSort}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow
              key={transaction.id}
              className="cursor-pointer"
              onClick={() => onOpen(transaction.id)}
            >
              <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                {formatDateWithYear(transaction.postedAt)}
              </TableCell>
              <TableCell className="max-w-0 w-full">
                <span className="flex items-center gap-2.5">
                  <MerchantAvatar
                    category={transaction.category}
                    className="size-7"
                  />
                  <button
                    type="button"
                    className="min-w-0 truncate rounded-sm text-left font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(transaction.id);
                    }}
                  >
                    {transaction.description}
                  </button>
                  {transaction.note && (
                    <StickyNote
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Has a note"
                    />
                  )}
                </span>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                {CATEGORY_LABELS[transaction.category]}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">
                {transaction.accountName}
              </TableCell>
              <TableCell>
                <StatusBadge status={transaction.status} />
              </TableCell>
              <TableCell className="text-right">
                <Money
                  cents={transaction.amountCents}
                  signed
                  tone
                  className={cn(
                    "font-medium",
                    transaction.status === "failed" &&
                      "text-muted-foreground line-through",
                  )}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y md:hidden">
        {transactions.map((transaction) => (
          <li key={transaction.id}>
            <button
              type="button"
              onClick={() => onOpen(transaction.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <MerchantAvatar category={transaction.category} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {transaction.description}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {formatDateWithYear(transaction.postedAt)}
                  <span aria-hidden="true">·</span>
                  {METHOD_LABELS[transaction.method]}
                  {transaction.status !== "posted" && (
                    <StatusBadge status={transaction.status} />
                  )}
                </span>
              </span>
              <Money
                cents={transaction.amountCents}
                signed
                tone
                className="text-sm font-medium"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
