import {
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABELS, type TransactionStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STYLES: Record<
  TransactionStatus,
  { icon: LucideIcon; className: string }
> = {
  posted: { icon: CircleCheck, className: "text-muted-foreground" },
  pending: { icon: Clock, className: "text-foreground" },
  scheduled: { icon: CalendarClock, className: "text-brand-ink" },
  failed: { icon: CircleX, className: "text-destructive" },
};

/** Status as icon plus label, so it never depends on color alone. */
export function StatusBadge({
  status,
  className,
}: {
  status: TransactionStatus;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
