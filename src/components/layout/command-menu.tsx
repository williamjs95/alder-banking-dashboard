"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CreditCard,
  Moon,
  Search,
  Send,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Money } from "@/components/shared/money";
import { useDebouncedValue } from "@/components/shared/use-debounced-value";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatDate } from "@/lib/dates";
import { transactionsQuery } from "@/lib/queries";
import { NAV_ITEMS } from "./nav-items";
import { setTheme, useTheme } from "./theme";

const MIN_SEARCH_LENGTH = 2;

const ACTIONS = [
  { href: "/payments?new=payment", label: "Send money", icon: Send },
  {
    href: "/payments?new=transfer",
    label: "Transfer between accounts",
    icon: ArrowLeftRight,
  },
  { href: "/cards?new=card", label: "Issue a virtual card", icon: CreditCard },
] as const;

const matches = (label: string, query: string) =>
  label.toLowerCase().includes(query.trim().toLowerCase());

/** The palette's contents. Mounted only while open, so it fetches nothing at rest. */
function CommandMenuContent({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const debounced = useDebouncedValue(typed, 200);
  const searching = debounced.length >= MIN_SEARCH_LENGTH;

  const results = useQuery({
    ...transactionsQuery({ q: debounced, pageSize: 10 }),
    enabled: searching,
  });

  const go = (href: string) => {
    onDone();
    router.push(href);
  };

  const nextTheme = theme === "dark" ? "light" : "dark";
  const themeLabel = `Switch to ${nextTheme} theme`;
  const pages = NAV_ITEMS.filter((item) => matches(item.label, query));
  const actions = ACTIONS.filter((item) => matches(item.label, query));
  const showTheme = matches(themeLabel, query);
  const transactions = searching ? (results.data?.items ?? []) : [];

  // A search is pending from the first keystroke, not only once the request starts.
  const waiting =
    typed.length >= MIN_SEARCH_LENGTH &&
    (typed !== debounced || results.isFetching);
  const emptyMessage = waiting
    ? "Searching…"
    : searching && results.isError
      ? "Search is unavailable right now. Try again."
      : "No results.";

  return (
    <>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search transactions or jump to…"
      />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>

        {pages.length > 0 && (
          <CommandGroup heading="Go to">
            {pages.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={href} onSelect={() => go(href)}>
                <Icon aria-hidden="true" />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(actions.length > 0 || showTheme) && (
          <CommandGroup heading="Actions">
            {actions.map(({ href, label, icon: Icon }) => (
              <CommandItem key={href} value={href} onSelect={() => go(href)}>
                <Icon aria-hidden="true" />
                {label}
              </CommandItem>
            ))}
            {showTheme && (
              <CommandItem
                value="toggle-theme"
                onSelect={() => {
                  setTheme(nextTheme);
                  onDone();
                }}
              >
                {nextTheme === "dark" ? (
                  <Moon aria-hidden="true" />
                ) : (
                  <Sun aria-hidden="true" />
                )}
                {themeLabel}
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {transactions.length > 0 && (
          <CommandGroup heading="Transactions">
            {transactions.map((transaction) => (
              <CommandItem
                key={transaction.id}
                value={transaction.id}
                onSelect={() => go(`/transactions?tx=${transaction.id}`)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {transaction.description}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(transaction.postedAt)}
                </span>
                <Money
                  cents={transaction.amountCents}
                  signed
                  tone
                  className="w-24 text-right text-sm"
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

/** Search trigger plus the ⌘K palette: navigation, actions and transaction search. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-full max-w-xs justify-start gap-2 bg-card px-2.5 font-normal text-muted-foreground shadow-none"
      >
        <Search aria-hidden="true" />
        <span className="flex-1 truncate text-left">Search or jump to…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] leading-5 text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search transactions, jump to a page or run an action."
        showCloseButton={false}
        shouldFilter={false}
      >
        {open && <CommandMenuContent onDone={() => setOpen(false)} />}
      </CommandDialog>
    </>
  );
}
