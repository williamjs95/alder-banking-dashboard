import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { PaymentsView } from "@/features/payments/payments-view";
import { transactionFiltersSchema } from "@/lib/contracts";
import { queryKeys, SCHEDULED_PAYMENTS } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { listAccounts } from "@/server/services/accounts";
import { listRecipients } from "@/server/services/recipients";
import { listTransactions } from "@/server/services/transactions";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Payments" };

async function PaymentsData() {
  const { db, workspaceId } = await getRequestContext();
  const [accounts, recipients, scheduled] = await Promise.all([
    listAccounts(db, workspaceId),
    listRecipients(db, workspaceId),
    listTransactions(
      db,
      workspaceId,
      transactionFiltersSchema.parse(SCHEDULED_PAYMENTS),
    ),
  ]);
  return (
    <Hydrate
      entries={[
        [queryKeys.accounts, accounts],
        [queryKeys.recipients, recipients],
        [queryKeys.transactions(SCHEDULED_PAYMENTS), scheduled],
      ]}
    >
      <PaymentsView />
    </Hydrate>
  );
}

export default function PaymentsPage() {
  return (
    <>
      <PageHeader
        title="Payments"
        description="Send money, move it between accounts and manage recipients."
      />
      <Suspense fallback={<PageSkeleton label="Loading payments" />}>
        <PaymentsData />
      </Suspense>
    </>
  );
}
