"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  FILTER_KEYS,
  readFilters,
  type FilterKey,
  type RawFilters,
} from "@/lib/transaction-filters";

/** `tx` is the open transaction's id; it rides in the URL beside the filters. */
export type UrlPatch = Partial<Record<FilterKey | "tx", string | undefined>>;

const PAGING_KEYS = new Set<string>(["page", "tx"]);

/**
 * Filter state backed by the URL. Updates go through the History API, which
 * Next.js mirrors into `useSearchParams`, so changing a filter refetches data
 * from the API without re-rendering the route on the server.
 */
export function useTransactionFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: RawFilters = useMemo(
    () => readFilters((key) => searchParams.get(key)),
    [searchParams],
  );
  const openId = searchParams.get("tx");

  const update = useCallback(
    (patch: UrlPatch) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Any change to what is listed sends the reader back to the first page.
      const changesResults = Object.keys(patch).some(
        (key) => !PAGING_KEYS.has(key),
      );
      if (changesResults && !("page" in patch)) next.delete("page");

      const query = next.toString();
      window.history.replaceState(
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
    },
    [pathname],
  );

  const replaceFilters = useCallback(
    (nextFilters: RawFilters) => {
      const patch: UrlPatch = {};
      for (const key of FILTER_KEYS) patch[key] = nextFilters[key];
      update(patch);
    },
    [update],
  );

  return { filters, openId, update, replaceFilters };
}
