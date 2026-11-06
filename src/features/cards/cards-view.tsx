"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CircleAlert, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DEMO_USER } from "@/components/layout/user-menu";
import { Meter, meterLevel } from "@/components/shared/meter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api-client";
import type { CardDto } from "@/lib/contracts";
import type { CardStatus } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { accountsQuery, cardsQuery, queryKeys } from "@/lib/queries";
import { EditLimitDialog, IssueCardDialog } from "./card-dialogs";
import { CardVisual } from "./card-visual";

function LimitNote({ card }: { card: CardDto }) {
  const level = meterLevel(card.spentThisMonthCents, card.monthlyLimitCents);
  if (level === "normal") return null;
  const Icon = level === "critical" ? CircleAlert : TriangleAlert;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon
        className={
          level === "critical"
            ? "size-3.5 text-critical"
            : "size-3.5 text-warning"
        }
        aria-hidden="true"
      />
      {level === "critical" ? "Limit reached" : "Near limit"}
    </span>
  );
}

function CardPanel({
  card,
  onEditLimit,
}: {
  card: CardDto;
  onEditLimit: (card: CardDto) => void;
}) {
  const queryClient = useQueryClient();
  const frozen = card.status === "frozen";
  const switchId = `freeze-${card.id}`;

  const setStatus = useMutation({
    mutationFn: (status: CardStatus) =>
      api<CardDto>(`/api/cards/${card.id}`, {
        method: "PATCH",
        body: { status },
      }),
    // Flip the switch immediately; put it back if the server refuses.
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.cards });
      const previous = queryClient.getQueryData<CardDto[]>(queryKeys.cards);
      queryClient.setQueryData<CardDto[]>(queryKeys.cards, (cards) =>
        cards?.map((item) =>
          item.id === card.id ? { ...item, status } : item,
        ),
      );
      return { previous };
    },
    onError: (error, _status, context) => {
      queryClient.setQueryData(queryKeys.cards, context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: (updated) =>
      toast.success(
        updated.status === "frozen"
          ? `${updated.label} frozen`
          : `${updated.label} is active again`,
        {
          description:
            updated.status === "frozen"
              ? "New charges will be declined until you unfreeze it."
              : undefined,
        },
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.cards }),
  });

  const spentLabel = `${formatMoney(card.spentThisMonthCents, { whole: true })} of ${formatMoney(card.monthlyLimitCents, { whole: true })} spent this month`;

  return (
    <Card className="gap-4 p-4 shadow-none">
      <CardVisual card={card} />
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm">
            <span className="tabular font-medium">
              {formatMoney(card.spentThisMonthCents, { whole: true })}
            </span>
            <span className="text-muted-foreground">
              {" "}
              of {formatMoney(card.monthlyLimitCents, { whole: true })}
            </span>
          </span>
          <LimitNote card={card} />
        </div>
        <Meter
          value={card.spentThisMonthCents}
          max={card.monthlyLimitCents}
          label={spentLabel}
        />
        <p className="text-xs text-muted-foreground">
          This month · funded by {card.accountName}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <Switch
            id={switchId}
            checked={frozen}
            onCheckedChange={(checked) =>
              setStatus.mutate(checked ? "frozen" : "active")
            }
          />
          <Label htmlFor={switchId} className="text-sm font-normal">
            Freeze card
          </Label>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEditLimit(card)}>
            Edit limit
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/transactions?cardId=${card.id}`}>Activity</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Company cards: spend against each limit, freeze, re-limit, and issue new ones. */
export function CardsView() {
  const { data: cards } = useSuspenseQuery(cardsQuery);
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const issuing = searchParams.get("new") === "card";
  const [editing, setEditing] = useState<CardDto | null>(null);

  const setIssuing = (open: boolean) =>
    window.history.replaceState(
      null,
      "",
      open ? `${pathname}?new=card` : pathname,
    );

  const active = cards.filter((card) => card.status === "active").length;
  const spent = cards.reduce((sum, card) => sum + card.spentThisMonthCents, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {active} active of {cards.length} cards ·{" "}
          {formatMoney(spent, { whole: true })} spent this month
        </p>
        <Button size="sm" onClick={() => setIssuing(true)}>
          <Plus aria-hidden="true" />
          Issue virtual card
        </Button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id}>
            <CardPanel card={card} onEditLimit={setEditing} />
          </li>
        ))}
      </ul>
      <IssueCardDialog
        open={issuing}
        onClose={() => setIssuing(false)}
        accounts={accounts}
        defaultHolder={DEMO_USER.name}
      />
      <EditLimitDialog card={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
