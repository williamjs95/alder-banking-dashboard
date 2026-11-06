import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** One headline number with its label and an optional line of context. */
export function StatTile({
  label,
  value,
  footer,
}: {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="gap-1.5 px-5 py-4 shadow-none">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {footer && <div className="mt-0.5">{footer}</div>}
    </Card>
  );
}
