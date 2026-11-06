"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarClock,
  Plus,
  Send,
  UserRoundPlus,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionRow } from "@/components/shared/transaction-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { METHOD_LABELS } from "@/lib/domain";
import {
  accountsQuery,
  recipientsQuery,
  SCHEDULED_PAYMENTS,
  transactionsQuery,
} from "@/lib/queries";
import { AddRecipientDialog } from "./add-recipient-dialog";
import { SendPaymentDialog } from "./send-payment-dialog";
import { TransferDialog } from "./transfer-dialog";

type DialogName = "payment" | "transfer" | "recipient";
const DIALOGS: readonly string[] = ["payment", "transfer", "recipient"];

/**
 * Which dialog is open lives in the URL (`?new=payment`), so the top bar's
 * "Send money" button and the command palette can open one from any page.
 */
function useDialogParam() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("new");
  const dialog = raw && DIALOGS.includes(raw) ? (raw as DialogName) : null;
  const recipientId = searchParams.get("recipient") ?? undefined;

  const setDialog = (name: DialogName | null, recipient?: string) => {
    const next = new URLSearchParams();
    if (name) next.set("new", name);
    if (name && recipient) next.set("recipient", recipient);
    const query = next.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${pathname}?${query}` : pathname,
    );
  };

  return { dialog, recipientId, setDialog };
}

/** Send money, move it between accounts, and manage who you pay. */
export function PaymentsView() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const { data: recipients } = useSuspenseQuery(recipientsQuery);
  const scheduled = useQuery(transactionsQuery(SCHEDULED_PAYMENTS));
  const { dialog, recipientId, setDialog } = useDialogParam();
  const close = () => setDialog(null);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDialog("payment")}
          className="group rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card className="flex-row items-center gap-4 px-5 py-4 shadow-none transition-colors group-hover:border-input">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Send className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium">Send money</span>
              <span className="text-sm text-muted-foreground">
                Pay a recipient by ACH or wire
              </span>
            </span>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => setDialog("transfer")}
          className="group rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card className="flex-row items-center gap-4 px-5 py-4 shadow-none transition-colors group-hover:border-input">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <ArrowLeftRight className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium">
                Transfer between accounts
              </span>
              <span className="text-sm text-muted-foreground">
                Instant, with no fee
              </span>
            </span>
          </Card>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-2 px-5 py-4 shadow-none lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Recipients</h2>
            <Button
              variant="outline"
              size="sm"
              className="bg-card"
              onClick={() => setDialog("recipient")}
            >
              <Plus aria-hidden="true" />
              Add recipient
            </Button>
          </div>
          {recipients.length === 0 ? (
            <EmptyState
              icon={UserRoundPlus}
              title="No recipients yet"
              description="Add the people and businesses you pay to send money in one step."
            />
          ) : (
            <ul className="divide-y">
              {recipients.map((recipient) => (
                <li
                  key={recipient.id}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  >
                    {recipient.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {recipient.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {recipient.bankName} ••{recipient.accountLast4} ·{" "}
                      {METHOD_LABELS[recipient.defaultMethod]}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-card"
                    aria-label={`Pay ${recipient.name}`}
                    onClick={() => setDialog("payment", recipient.id)}
                  >
                    Pay
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-2 px-5 py-4 shadow-none">
          <h2 className="text-sm font-medium">Scheduled payments</h2>
          {scheduled.data && scheduled.data.items.length > 0 ? (
            <ul>
              {scheduled.data.items.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow transaction={transaction} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title={scheduled.isPending ? "Loading…" : "Nothing scheduled"}
              description="Choose a future date when sending money and it will wait here."
            />
          )}
        </Card>
      </div>

      <SendPaymentDialog
        open={dialog === "payment"}
        onClose={close}
        accounts={accounts}
        recipients={recipients}
        initialRecipientId={recipientId}
      />
      <TransferDialog
        open={dialog === "transfer"}
        onClose={close}
        accounts={accounts}
      />
      <AddRecipientDialog open={dialog === "recipient"} onClose={close} />
    </div>
  );
}
