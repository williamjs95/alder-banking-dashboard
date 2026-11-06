import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { OverviewSkeleton } from "@/features/overview/overview-skeleton";
import { OverviewView } from "@/features/overview/overview-view";
import { queryKeys } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { getOverview } from "@/server/services/overview";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Overview" };

async function OverviewData() {
  const { db, workspaceId, now } = await getRequestContext();
  const overview = await getOverview(db, workspaceId, now);
  return (
    <Hydrate entries={[[queryKeys.overview, overview]]}>
      <OverviewView />
    </Hydrate>
  );
}

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Cash position across every Brightline Labs account"
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData />
      </Suspense>
    </>
  );
}
