import {
  ArrowLeftRight,
  Building2,
  Cloud,
  HandCoins,
  Landmark,
  Megaphone,
  Percent,
  Plane,
  Receipt,
  Scale,
  ShieldCheck,
  SquareTerminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  revenue: HandCoins,
  payroll: Users,
  taxes: Landmark,
  rent: Building2,
  cloud: Cloud,
  software: SquareTerminal,
  marketing: Megaphone,
  travel: Plane,
  services: Scale,
  insurance: ShieldCheck,
  interest: Percent,
  transfer: ArrowLeftRight,
  other: Receipt,
};

/** A neutral category glyph beside a transaction. Decorative: the row has the text. */
export function MerchantAvatar({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
