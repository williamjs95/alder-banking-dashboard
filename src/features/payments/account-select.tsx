"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountDto } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";

/** Account picker that shows each account's available balance. */
export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Choose an account",
  ...aria
}: {
  accounts: readonly AccountDto[];
  value: string | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <span>{account.name}</span>
            <span className="tabular text-muted-foreground">
              {formatMoney(account.balanceCents)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
