"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { AmountInput } from "@/components/shared/amount-input";
import { Field, fieldAria } from "@/components/shared/field";
import { Money } from "@/components/shared/money";
import { SegmentedControl } from "@/components/shared/segmented-control";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import {
  createPaymentSchema,
  type AccountDto,
  type CreatePaymentInput,
  type PaymentResultDto,
  type RecipientDto,
} from "@/lib/contracts";
import { addDays, dayKey, formatDateWithYear } from "@/lib/dates";
import {
  METHOD_LABELS,
  WIRE_FEE_CENTS,
  type PaymentMethod,
} from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { newIdempotencyKey, refreshLedger } from "@/lib/mutations";
import { AccountSelect } from "./account-select";
import { SuccessPanel, SummaryRow } from "./success-panel";

const METHOD_OPTIONS = [
  { value: "ach", label: "ACH · free" },
  {
    value: "wire",
    label: `Wire · ${formatMoney(WIRE_FEE_CENTS, { whole: true })}`,
  },
] as const satisfies readonly { value: PaymentMethod; label: string }[];

const METHOD_HINTS: Record<PaymentMethod, string> = {
  ach: "Arrives in 1 to 2 business days.",
  wire: "Arrives the same business day.",
};

type FormValues = {
  fromAccountId: string;
  recipientId: string;
  amountCents: number;
  method: PaymentMethod;
  memo?: string;
  scheduledFor?: string;
};

type Step =
  | { name: "form" }
  | { name: "review"; input: CreatePaymentInput; key: string }
  | { name: "done"; result: PaymentResultDto };

const feeFor = (input: Pick<CreatePaymentInput, "method" | "scheduledFor">) =>
  input.method === "wire" && !input.scheduledFor ? WIRE_FEE_CENTS : 0;

function PaymentFlow({
  accounts,
  recipients,
  initialRecipientId,
  onClose,
}: {
  accounts: readonly AccountDto[];
  recipients: readonly RecipientDto[];
  initialRecipientId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ name: "form" });
  const initialRecipient = recipients.find(
    (recipient) => recipient.id === initialRecipientId,
  );

  const form = useForm<FormValues, unknown, CreatePaymentInput>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      fromAccountId: accounts[0]?.id ?? "",
      recipientId: initialRecipient?.id ?? "",
      method: initialRecipient?.defaultMethod ?? "ach",
      memo: "",
    },
  });
  const { errors } = form.formState;
  const method = useWatch({ control: form.control, name: "method" });

  const send = useMutation({
    mutationFn: ({ input, key }: { input: CreatePaymentInput; key: string }) =>
      api<PaymentResultDto>("/api/payments", {
        method: "POST",
        body: input,
        idempotencyKey: key,
      }),
    onSuccess: async (result) => {
      setStep({ name: "done", result });
      await refreshLedger(queryClient);
    },
    onError: (error) => {
      // Field-level problems go back to the form, next to the field at fault.
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) {
        setStep({ name: "form" });
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof FormValues, { message });
        }
      }
    },
  });

  const toReview = form.handleSubmit((input) => {
    const account = accounts.find((item) => item.id === input.fromAccountId);
    const total = input.amountCents + feeFor(input);
    if (account && !input.scheduledFor && total > account.balanceCents) {
      form.setError("amountCents", {
        message: `Exceeds the available balance of ${formatMoney(account.balanceCents)}`,
      });
      return;
    }
    send.reset();
    // One key per reviewed payment: retrying the same review cannot pay twice.
    setStep({ name: "review", input, key: newIdempotencyKey() });
  });

  if (step.name === "done") {
    const { payment } = step.result;
    const scheduled = payment.status === "scheduled";
    return (
      <>
        <DialogHeader className="sr-only">
          <DialogTitle>Payment {scheduled ? "scheduled" : "sent"}</DialogTitle>
          <DialogDescription>Confirmation</DialogDescription>
        </DialogHeader>
        <SuccessPanel
          title={scheduled ? "Payment scheduled" : "Payment sent"}
          description={`${formatMoney(-payment.amountCents)} to ${payment.description} ${
            scheduled
              ? `will go out on ${formatDateWithYear(payment.postedAt)}.`
              : "is on its way."
          } Reference ${payment.reference}.`}
        >
          <Button asChild variant="outline">
            <Link href={`/transactions?tx=${payment.id}`}>
              View transaction
            </Link>
          </Button>
          <Button onClick={onClose}>Done</Button>
        </SuccessPanel>
      </>
    );
  }

  if (step.name === "review") {
    const { input } = step;
    const account = accounts.find((item) => item.id === input.fromAccountId);
    const recipient = recipients.find((item) => item.id === input.recipientId);
    const fee = feeFor(input);
    return (
      <>
        <DialogHeader>
          <DialogTitle>Review payment</DialogTitle>
          <DialogDescription>
            Check the details. Money leaves your account when you confirm.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y rounded-lg border px-4">
          <SummaryRow label="To">
            {recipient?.name}
            <span className="block text-xs text-muted-foreground">
              {recipient?.bankName} ••{recipient?.accountLast4}
            </span>
          </SummaryRow>
          <SummaryRow label="From">{account?.name}</SummaryRow>
          <SummaryRow label="Method">{METHOD_LABELS[input.method]}</SummaryRow>
          <SummaryRow label="Send on">
            {input.scheduledFor
              ? formatDateWithYear(input.scheduledFor)
              : "Today"}
          </SummaryRow>
          {input.memo && <SummaryRow label="Memo">{input.memo}</SummaryRow>}
          <SummaryRow label="Amount">
            <Money cents={input.amountCents} />
          </SummaryRow>
          {fee > 0 && (
            <SummaryRow label="Wire fee">
              <Money cents={fee} />
            </SummaryRow>
          )}
          <SummaryRow label="Total" strong>
            <Money cents={input.amountCents + fee} />
          </SummaryRow>
        </dl>
        {send.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(send.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={send.isPending}
            onClick={() => setStep({ name: "form" })}
          >
            Back
          </Button>
          <Button
            disabled={send.isPending}
            onClick={() => send.mutate({ input: step.input, key: step.key })}
          >
            {send.isPending
              ? "Sending…"
              : input.scheduledFor
                ? "Schedule payment"
                : `Send ${formatMoney(input.amountCents + fee)}`}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send money</DialogTitle>
        <DialogDescription>
          Pay a saved recipient by ACH or wire, now or on a later date.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={toReview} noValidate>
        <Field
          id="payment-recipient"
          label="Recipient"
          error={errors.recipientId?.message}
        >
          <Controller
            control={form.control}
            name="recipientId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(id) => {
                  field.onChange(id);
                  const chosen = recipients.find((item) => item.id === id);
                  if (chosen) form.setValue("method", chosen.defaultMethod);
                }}
              >
                <SelectTrigger
                  className="w-full"
                  {...fieldAria(
                    "payment-recipient",
                    errors.recipientId?.message,
                  )}
                >
                  <SelectValue placeholder="Choose a recipient" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((recipient) => (
                    <SelectItem key={recipient.id} value={recipient.id}>
                      {recipient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          id="payment-from"
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
                {...fieldAria("payment-from", errors.fromAccountId?.message)}
              />
            )}
          />
        </Field>

        <Field
          id="payment-amount"
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
                {...fieldAria("payment-amount", errors.amountCents?.message)}
              />
            )}
          />
        </Field>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Method</span>
          <div>
            <SegmentedControl
              label="Payment method"
              options={METHOD_OPTIONS}
              value={method}
              onChange={(value) => form.setValue("method", value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {METHOD_HINTS[method]}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="payment-date"
            label="Send on"
            hint="Leave empty to send today."
            error={errors.scheduledFor?.message}
          >
            <Input
              type="date"
              min={dayKey(addDays(new Date(), 1))}
              {...form.register("scheduledFor", {
                setValueAs: (value: string) => value || undefined,
              })}
              {...fieldAria(
                "payment-date",
                errors.scheduledFor?.message,
                "Leave empty to send today.",
              )}
            />
          </Field>
          <Field
            id="payment-memo"
            label="Memo"
            hint="Optional. Shown on the transaction."
            error={errors.memo?.message}
          >
            <Input
              maxLength={140}
              {...form.register("memo")}
              {...fieldAria(
                "payment-memo",
                errors.memo?.message,
                "Optional. Shown on the transaction.",
              )}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Review payment</Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Three-step payment: details, review, confirmation. */
export function SendPaymentDialog({
  open,
  onClose,
  ...flow
}: {
  open: boolean;
  onClose: () => void;
  accounts: readonly AccountDto[];
  recipients: readonly RecipientDto[];
  initialRecipientId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {/* Mounted per opening: every payment starts from a clean form. */}
        {open && <PaymentFlow {...flow} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
