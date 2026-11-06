"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AmountInput } from "@/components/shared/amount-input";
import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import {
  createTransferSchema,
  type AccountDto,
  type CreateTransferInput,
  type TransferResultDto,
} from "@/lib/contracts";
import { formatMoney } from "@/lib/money";
import { newIdempotencyKey, refreshLedger } from "@/lib/mutations";
import { AccountSelect } from "./account-select";
import { SuccessPanel } from "./success-panel";

type FormValues = {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  memo?: string;
};

function TransferFlow({
  accounts,
  onClose,
}: {
  accounts: readonly AccountDto[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<TransferResultDto | null>(null);
  // Stable for this opening of the dialog, so a retried submit is not a second transfer.
  const idempotencyKey = useRef(newIdempotencyKey());

  const form = useForm<FormValues, unknown, CreateTransferInput>({
    resolver: zodResolver(createTransferSchema),
    defaultValues: {
      fromAccountId: accounts[0]?.id ?? "",
      toAccountId: accounts[1]?.id ?? "",
      memo: "",
    },
  });
  const { errors } = form.formState;

  const transfer = useMutation({
    mutationFn: (input: CreateTransferInput) =>
      api<TransferResultDto>("/api/transfers", {
        method: "POST",
        body: input,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async (data) => {
      setResult(data);
      await refreshLedger(queryClient);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof FormValues, { message });
        }
      }
    },
  });

  const submit = form.handleSubmit((input) => {
    const from = accounts.find((item) => item.id === input.fromAccountId);
    if (from && input.amountCents > from.balanceCents) {
      form.setError("amountCents", {
        message: `Exceeds the available balance of ${formatMoney(from.balanceCents)}`,
      });
      return;
    }
    transfer.mutate(input);
  });

  if (result) {
    return (
      <>
        <DialogHeader className="sr-only">
          <DialogTitle>Transfer complete</DialogTitle>
          <DialogDescription>Confirmation</DialogDescription>
        </DialogHeader>
        <SuccessPanel
          title="Transfer complete"
          description={`${formatMoney(result.credit.amountCents)} moved from ${result.debit.accountName} to ${result.credit.accountName}. Both balances are already updated.`}
        >
          <Button onClick={onClose}>Done</Button>
        </SuccessPanel>
      </>
    );
  }

  const hasFieldErrors =
    transfer.error instanceof ApiError &&
    Object.keys(transfer.error.fields).length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Transfer between accounts</DialogTitle>
        <DialogDescription>
          Moves instantly between your own accounts, with no fee.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field
          id="transfer-from"
          label="From"
          error={errors.fromAccountId?.message}
        >
          <Controller
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <AccountSelect
                accounts={accounts}
                value={field.value}
                onChange={field.onChange}
                {...fieldAria("transfer-from", errors.fromAccountId?.message)}
              />
            )}
          />
        </Field>
        <Field id="transfer-to" label="To" error={errors.toAccountId?.message}>
          <Controller
            control={form.control}
            name="toAccountId"
            render={({ field }) => (
              <AccountSelect
                accounts={accounts}
                value={field.value}
                onChange={field.onChange}
                {...fieldAria("transfer-to", errors.toAccountId?.message)}
              />
            )}
          />
        </Field>
        <Field
          id="transfer-amount"
          label="Amount"
          error={errors.amountCents?.message}
        >
          <Controller
            control={form.control}
            name="amountCents"
            render={({ field }) => (
              <AmountInput
                value={field.value ?? null}
                onChange={(cents) => field.onChange(cents ?? undefined)}
                onBlur={field.onBlur}
                {...fieldAria("transfer-amount", errors.amountCents?.message)}
              />
            )}
          />
        </Field>
        <Field
          id="transfer-memo"
          label="Memo"
          hint="Optional."
          error={errors.memo?.message}
        >
          <Input
            maxLength={140}
            {...form.register("memo")}
            {...fieldAria("transfer-memo", errors.memo?.message, "Optional.")}
          />
        </Field>
        {transfer.isError && !hasFieldErrors && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(transfer.error)}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={transfer.isPending}>
            {transfer.isPending ? "Transferring…" : "Transfer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function TransferDialog({
  open,
  onClose,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  accounts: readonly AccountDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {open && <TransferFlow accounts={accounts} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
