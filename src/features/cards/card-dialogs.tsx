"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
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
  createCardSchema,
  updateCardSchema,
  type AccountDto,
  type CardDto,
  type CreateCardInput,
} from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";
import { AccountSelect } from "@/features/payments/account-select";

type IssueValues = {
  label: string;
  holderName: string;
  accountId: string;
  monthlyLimitCents: number;
};

function IssueCardForm({
  accounts,
  defaultHolder,
  onClose,
}: {
  accounts: readonly AccountDto[];
  defaultHolder: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<IssueValues, unknown, CreateCardInput>({
    resolver: zodResolver(createCardSchema),
    defaultValues: {
      label: "",
      holderName: defaultHolder,
      accountId: accounts[0]?.id ?? "",
      monthlyLimitCents: 1_000_00,
    },
  });
  const { errors } = form.formState;

  const issue = useMutation({
    mutationFn: (input: CreateCardInput) =>
      api<CardDto>("/api/cards", { method: "POST", body: input }),
    onSuccess: async (card) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cards });
      toast.success(`${card.label} card issued`, {
        description: `Virtual card ending in ${card.last4} is ready to use.`,
      });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof IssueValues, { message });
        }
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit((input) => issue.mutate(input))}
      noValidate
    >
      <Field
        id="card-label"
        label="Card name"
        hint="What the card is for, such as “Conference travel”."
        error={errors.label?.message}
      >
        <Input
          autoComplete="off"
          {...form.register("label")}
          {...fieldAria(
            "card-label",
            errors.label?.message,
            "What the card is for, such as “Conference travel”.",
          )}
        />
      </Field>
      <Field
        id="card-holder"
        label="Cardholder"
        error={errors.holderName?.message}
      >
        <Input
          autoComplete="off"
          {...form.register("holderName")}
          {...fieldAria("card-holder", errors.holderName?.message)}
        />
      </Field>
      <Field
        id="card-account"
        label="Funding account"
        error={errors.accountId?.message}
      >
        <Controller
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <AccountSelect
              accounts={accounts}
              value={field.value}
              onChange={field.onChange}
              {...fieldAria("card-account", errors.accountId?.message)}
            />
          )}
        />
      </Field>
      <Field
        id="card-limit"
        label="Monthly limit"
        error={errors.monthlyLimitCents?.message}
      >
        <Controller
          control={form.control}
          name="monthlyLimitCents"
          render={({ field }) => (
            <AmountInput
              value={field.value}
              onChange={(cents) => field.onChange(cents ?? undefined)}
              onBlur={field.onBlur}
              {...fieldAria("card-limit", errors.monthlyLimitCents?.message)}
            />
          )}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={issue.isPending}>
          {issue.isPending ? "Issuing…" : "Issue card"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function IssueCardDialog({
  open,
  onClose,
  accounts,
  defaultHolder,
}: {
  open: boolean;
  onClose: () => void;
  accounts: readonly AccountDto[];
  defaultHolder: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a virtual card</DialogTitle>
          <DialogDescription>
            Ready to use immediately, with its own monthly spending limit.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <IssueCardForm
            accounts={accounts}
            defaultHolder={defaultHolder}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const limitSchema = updateCardSchema.shape.monthlyLimitCents.unwrap();

function LimitForm({ card, onClose }: { card: CardDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState<number | null>(card.monthlyLimitCents);
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: (monthlyLimitCents: number) =>
      api<CardDto>(`/api/cards/${card.id}`, {
        method: "PATCH",
        body: { monthlyLimitCents },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cards });
      toast.success("Monthly limit updated");
      onClose();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = limitSchema.safeParse(limit ?? undefined);
        if (!parsed.success) {
          setError(
            limit === null ? "Enter a limit" : parsed.error.issues[0].message,
          );
          return;
        }
        setError(undefined);
        save.mutate(parsed.data);
      }}
    >
      <Field id="limit-amount" label="Monthly limit" error={error}>
        <AmountInput
          value={limit}
          onChange={setLimit}
          {...fieldAria("limit-amount", error)}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save limit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditLimitDialog({
  card,
  onClose,
}: {
  /** The card being edited, or null when the dialog is closed. */
  card: CardDto | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={card !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change monthly limit</DialogTitle>
          <DialogDescription>
            {card
              ? `${card.label} ••${card.last4}. The limit resets on the 1st of each month.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {card && <LimitForm key={card.id} card={card} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
