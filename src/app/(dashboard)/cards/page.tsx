import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { CardsView } from "@/features/cards/cards-view";
import { queryKeys } from "@/lib/queries";
import { Hydrate } from "@/server/hydrate";
import { listAccounts } from "@/server/services/accounts";
import { listCards } from "@/server/services/cards";
import { getRequestContext } from "@/server/session";

export const metadata: Metadata = { title: "Cards" };

async function CardsData() {
  const { db, workspaceId, now } = await getRequestContext();
  const [cards, accounts] = await Promise.all([
    listCards(db, workspaceId, now),
    listAccounts(db, workspaceId),
  ]);
  return (
    <Hydrate
      entries={[
        [queryKeys.cards, cards],
        [queryKeys.accounts, accounts],
      ]}
    >
      <CardsView />
    </Hydrate>
  );
}

export default function CardsPage() {
  return (
    <>
      <PageHeader
        title="Cards"
        description="Company cards with per-card limits you control."
      />
      <Suspense fallback={<PageSkeleton label="Loading cards" />}>
        <CardsData />
      </Suspense>
    </>
  );
}
