import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  CreditCard,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/payments", label: "Payments", icon: ArrowLeftRight },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/insights", label: "Insights", icon: ChartNoAxesCombined },
];

/** Whether `pathname` is the item's page or one nested under it. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
