"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Circle, CircleX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/shared/copy-button";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";
import {
  ASSIGNABLE_CATEGORIES,
  type TransactionDto,
  type UpdateTransactionInput,
} from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";
import {
  CATEGORY_LABELS,
  METHOD_LABELS,
  type TransactionStatus,
} from "@/lib/domain";
import { refreshLedger } from "@/lib/mutations";
import { queryKeys, transactionQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Step = { label: string; state: "done" | "current" | "todo" | "failed" };

/** Where a payment is on its way from initiated to posted. */
export function timelineFor(status: TransactionStatus): Step[] {
  switch (status) {
    case "posted":
      return [
        { label: "Initiated", state: "done" },
        { label: "Processing", state: "done" },
        { label: "Posted", state: "done" },
      ];
    case "pending":
      return [
        { label: "Initiated", state: "done" },
        { label: "Processing", state: "current" },
        { label: "Posted", state: "todo" },
      ];
    case "scheduled":
      return [
        { label: "Scheduled", state: "current" },
        { label: "Processing", state: "todo" },
        { label: "Posted", state: "todo" },
      ];
    case "failed":
      return [
        { label: "Initiated", state: "done" },
        { label: "Returned", state: "failed" },
      ];
  }
}

function Timeline({ status }: { status: TransactionStatus }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Payment progress">
      {timelineFor(status).map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          {index > 0 && (
            <span className="h-px w-5 bg-border" aria-hidden="true" />
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs",
              step.state === "todo" && "text-muted-foreground",
              step.state === "current" && "font-medium",
              step.state === "failed" && "font-medium text-destructive",
            )}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {step.state === "done" && (
              <Check className="size-3.5 text-positive" aria-hidden="true" />
            )}
            {step.state === "current" && (
              <Circle
                className="size-3 fill-brand text-brand"
                aria-hidden="true"
              />
            )}
            {step.state === "todo" && (
              <Circle className="size-3" aria-hidden="true" />
            )}
            {step.state === "failed" && (
              <CircleX className="size-3.5" aria-hidden="true" />
            )}
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right">{children}</dd>
    </div>
  );
}

function Details({ transaction }: { transaction: TransactionDto }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(transaction.note ?? "");
  const systemCategory =
    transaction.category === "transfer" || transaction.category === "interest";

  const save = useMutation({
    mutationFn: (input: UpdateTransactionInput) =>
      api<TransactionDto>(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.transaction(updated.id), updated);
      await refreshLedger(queryClient);
      toast.success("Transaction updated");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const noteChanged = note.trim() !== (transaction.note ?? "");

  return (
    <div className="grid gap-6 px-4 pb-6">
      <div>
        <Money
          cents={transaction.amountCents}
          signed
          tone
          className="text-3xl font-semibold tracking-tight"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={transaction.status} />
          <Timeline status={transaction.status} />
        </div>
      </div>

      <dl className="divide-y border-y">
        <Row label="Date">{formatDateTime(transaction.postedAt)}</Row>
        <Row label="Account">{transaction.accountName}</Row>
        {transaction.counterpartyAccountName && (
          <Row label={transaction.amountCents < 0 ? "To" : "From"}>
            {transaction.counterpartyAccountName}
          </Row>
        )}
        <Row label="Method">{METHOD_LABELS[transaction.method]}</Row>
        {transaction.cardLabel && (
          <Row label="Card">
            {transaction.cardLabel} ••{transaction.cardLast4}
          </Row>
        )}
        <Row label="Reference">
          <span className="font-mono text-xs">{transaction.reference}</span>
          <CopyButton value={transaction.reference} label="reference" />
        </Row>
        <Row label="Category">
          {systemCategory ? (
            CATEGORY_LABELS[transaction.category]
          ) : (
            <Select
              value={transaction.category}
              disabled={save.isPending}
              onValueChange={(category) =>
                save.mutate({
                  category: category as UpdateTransactionInput["category"],
                })
              }
            >
              <SelectTrigger size="sm" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {ASSIGNABLE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Row>
      </dl>

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ note: note.trim() || null });
        }}
      >
        <Label htmlFor="transaction-note">Note</Label>
        <Textarea
          id="transaction-note"
          value={note}
          maxLength={280}
          rows={3}
          placeholder="Add context for your team or your bookkeeper"
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="tabular text-xs text-muted-foreground">
            {note.length}/280
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={!noteChanged || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save note"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Side panel with one transaction's full detail, its category and its note. */
export function TransactionSheet({
  id,
  seed,
  onClose,
}: {
  id: string | null;
  /** The row from the list, shown instantly while the detail request runs. */
  seed?: TransactionDto;
  onClose: () => void;
}) {
  const query = useQuery({
    ...transactionQuery(id ?? ""),
    enabled: id !== null,
    placeholderData: seed,
  });
  const transaction = query.data;

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-2 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-8">
            {transaction?.description ??
              (query.isError ? "Transaction unavailable" : "Loading…")}
          </SheetTitle>
          <SheetDescription>Transaction details</SheetDescription>
        </SheetHeader>
        {transaction ? (
          // Keyed so the note field resets when another transaction opens, or
          // when the loaded detail carries a newer note than the list row did.
          <Details
            key={`${transaction.id}:${transaction.note ?? ""}`}
            transaction={transaction}
          />
        ) : query.isError ? (
          <p role="alert" className="px-4 text-sm text-muted-foreground">
            {errorMessage(query.error)}
          </p>
        ) : (
          <div className="grid gap-3 px-4" aria-busy="true">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
