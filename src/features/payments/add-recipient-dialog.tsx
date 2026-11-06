"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Field, fieldAria } from "@/components/shared/field";
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
import { api, ApiError, errorMessage } from "@/lib/api-client";
import {
  createRecipientSchema,
  type CreateRecipientFormValues,
  type CreateRecipientInput,
  type RecipientDto,
} from "@/lib/contracts";
import { queryKeys } from "@/lib/queries";

const METHODS = [
  { value: "ach", label: "ACH" },
  { value: "wire", label: "Wire" },
] as const;

function RecipientForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (recipient: RecipientDto) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<
    CreateRecipientFormValues,
    unknown,
    CreateRecipientInput
  >({
    resolver: zodResolver(createRecipientSchema),
    defaultValues: {
      name: "",
      email: "",
      bankName: "",
      routingNumber: "",
      accountNumber: "",
      defaultMethod: "ach",
    },
  });
  const { errors } = form.formState;
  // The "ach" fallback is unreachable: `defaultValues` always holds a method.
  // It only narrows the schema's optional input type, so it is not a branch.
  /* v8 ignore next -- @preserve */
  const method =
    useWatch({ control: form.control, name: "defaultMethod" }) ?? "ach";

  const create = useMutation({
    mutationFn: (input: CreateRecipientInput) =>
      api<RecipientDto>("/api/recipients", { method: "POST", body: input }),
    onSuccess: async (recipient) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.recipients });
      toast.success(`${recipient.name} added`);
      onCreated?.(recipient);
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fields)) {
          form.setError(field as keyof CreateRecipientFormValues, { message });
        }
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={form.handleSubmit((input) => create.mutate(input))}
      noValidate
    >
      <Field id="recipient-name" label="Name" error={errors.name?.message}>
        <Input
          autoComplete="off"
          {...form.register("name")}
          {...fieldAria("recipient-name", errors.name?.message)}
        />
      </Field>
      <Field
        id="recipient-email"
        label="Email"
        hint="Optional. Used for payment notices."
        error={errors.email?.message}
      >
        <Input
          type="email"
          autoComplete="off"
          {...form.register("email")}
          {...fieldAria(
            "recipient-email",
            errors.email?.message,
            "Optional. Used for payment notices.",
          )}
        />
      </Field>
      <Field id="recipient-bank" label="Bank" error={errors.bankName?.message}>
        <Input
          autoComplete="off"
          {...form.register("bankName")}
          {...fieldAria("recipient-bank", errors.bankName?.message)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="recipient-routing"
          label="Routing number"
          error={errors.routingNumber?.message}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            {...form.register("routingNumber")}
            {...fieldAria("recipient-routing", errors.routingNumber?.message)}
          />
        </Field>
        <Field
          id="recipient-account"
          label="Account number"
          error={errors.accountNumber?.message}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            {...form.register("accountNumber")}
            {...fieldAria("recipient-account", errors.accountNumber?.message)}
          />
        </Field>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Default method</span>
        <div>
          <SegmentedControl
            label="Default payment method"
            options={METHODS}
            value={method}
            onChange={(value) => form.setValue("defaultMethod", value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add recipient"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddRecipientDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (recipient: RecipientDto) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add recipient</DialogTitle>
          <DialogDescription>
            Save a person or business you pay, so sending money takes one step.
          </DialogDescription>
        </DialogHeader>
        {open && <RecipientForm onClose={onClose} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}
