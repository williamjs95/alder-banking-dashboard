import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { InsightsView } from "@/features/insights/insights-view";
import { queryKeys } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { getInsights } from "@/server/services/insights";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Insights" };

async function InsightsData() {
  const { db, workspaceId, now } = await getRequestContext();
  const insights = await getInsights(db, workspaceId, now);
  return (
    <Hydrate entries={[[queryKeys.insights, insights]]}>
      <InsightsView />
    </Hydrate>
  );
}

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="Where the money goes, who it goes to, and what changed."
      />
      <Suspense fallback={<PageSkeleton label="Loading insights" />}>
        <InsightsData />
      </Suspense>
    </>
  );
}
