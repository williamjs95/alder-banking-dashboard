import "server-only";

import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Seeds the client's query cache with data the server already loaded, so the
 * first paint is complete HTML and the browser does not refetch on arrival.
 * Render it only after request data has been read (it stamps the current time).
 */
export function Hydrate({
  entries,
  children,
}: {
  entries: readonly (readonly [QueryKey, unknown])[];
  children: ReactNode;
}) {
  const queryClient = new QueryClient();
  for (const [key, data] of entries) queryClient.setQueryData(key, data);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
