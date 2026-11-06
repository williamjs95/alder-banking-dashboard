import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { AccountsView } from "@/features/accounts/accounts-view";
import { queryKeys } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { listAccounts } from "@/server/services/accounts";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Accounts" };

async function AccountsData() {
  const { db, workspaceId } = await getRequestContext();
  const accounts = await listAccounts(db, workspaceId);
  return (
    <Hydrate entries={[[queryKeys.accounts, accounts]]}>
      <AccountsView />
    </Hydrate>
  );
}

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Where your cash is held, and what each account earns."
      />
      <Suspense fallback={<PageSkeleton label="Loading accounts" />}>
        <AccountsData />
      </Suspense>
    </>
  );
}
