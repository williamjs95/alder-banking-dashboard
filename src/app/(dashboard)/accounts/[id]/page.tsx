import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { AccountDetailView } from "@/features/accounts/account-detail-view";
import { queryKeys } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { AppError } from "@/server/http/errors";
import { parseId } from "@/server/http/handler";
import { getAccountDetail } from "@/server/services/accounts";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Account" };

type Params = PageProps<"/accounts/[id]">["params"];

async function AccountData({ params }: { params: Params }) {
  const { id } = await params;
  const { db, workspaceId, now } = await getRequestContext();
  let detail;
  try {
    detail = await getAccountDetail(
      db,
      workspaceId,
      parseId(id, "Account"),
      now,
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <Hydrate entries={[[queryKeys.account(detail.account.id), detail]]}>
      <AccountDetailView accountId={detail.account.id} />
    </Hydrate>
  );
}

export default function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading account" />}>
      <AccountData params={params} />
    </Suspense>
  );
}
