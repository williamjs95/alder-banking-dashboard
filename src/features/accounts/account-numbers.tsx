"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import type { AccountNumbersDto } from "@/lib/contracts";

/**
 * Account and routing numbers, masked until asked for. The full numbers are a
 * separate request made on reveal and dropped from memory when hidden again.
 */
export function AccountNumbers({
  accountId,
  last4,
}: {
  accountId: string;
  last4: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const numbers = useQuery({
    queryKey: ["accounts", accountId, "numbers"],
    queryFn: ({ signal }) =>
      api<AccountNumbersDto>(`/api/accounts/${accountId}/numbers`, { signal }),
    enabled: revealed,
    staleTime: 0,
    gcTime: 0,
  });
  const shown = revealed ? numbers.data : undefined;

  return (
    <div className="grid gap-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Account number</dt>
          <dd className="flex items-center gap-1 code text-sm">
            {shown ? shown.accountNumber : `••••••••${last4}`}
            {shown && (
              <CopyButton value={shown.accountNumber} label="account number" />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Routing number</dt>
          <dd className="flex items-center gap-1 code text-sm">
            {shown ? shown.routingNumber : "•••••••••"}
            {shown && (
              <CopyButton value={shown.routingNumber} label="routing number" />
            )}
          </dd>
        </div>
      </dl>
      {numbers.isError && revealed && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(numbers.error)}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={revealed && numbers.isLoading}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? (
            <EyeOff aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          {revealed
            ? numbers.isLoading
              ? "Loading…"
              : "Hide numbers"
            : "Show numbers"}
        </Button>
      </div>
    </div>
  );
}
