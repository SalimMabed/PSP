import type { IconName } from "@/components/ui/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Shown in the mobile navigation bar (the others go in "Menu"). */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", mobile: true },
  { to: "/transactions", label: "Transactions", icon: "transactions", mobile: true },
  { to: "/collect", label: "Collect", icon: "collect", mobile: true },
  { to: "/customers", label: "Customers", icon: "customers" },
  { to: "/merchants", label: "Merchants", icon: "merchants" },
  { to: "/settlements", label: "Settlements", icon: "settlements", mobile: true },
  { to: "/developers", label: "Developers", icon: "developers" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export interface PageInfo {
  title: string;
  /** The page depends on the global period (selector shown in the header). */
  usesPeriod: boolean;
  /** Navigation entry to highlight. */
  navTo: string | null;
}

/** Title (h1) and metadata of the current page, including dynamic routes. */
export function pageInfo(pathname: string): PageInfo {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return { title: "Dashboard", usesPeriod: true, navTo: "/" };
  if (p === "/transactions") return { title: "Transactions", usesPeriod: true, navTo: "/transactions" };
  if (p.startsWith("/transactions/")) return { title: "Transaction details", usesPeriod: false, navTo: "/transactions" };
  if (p === "/collect") return { title: "Collect payments", usesPeriod: false, navTo: "/collect" };
  if (p === "/customers") return { title: "Customers", usesPeriod: false, navTo: "/customers" };
  if (p.startsWith("/customers/")) return { title: "Customer profile", usesPeriod: false, navTo: "/customers" };
  if (p === "/merchants") return { title: "Merchants", usesPeriod: false, navTo: "/merchants" };
  if (p.startsWith("/merchants/")) return { title: "Merchant profile", usesPeriod: false, navTo: "/merchants" };
  if (p === "/settlements") return { title: "Settlements", usesPeriod: false, navTo: "/settlements" };
  if (p === "/developers") return { title: "Developer area", usesPeriod: false, navTo: "/developers" };
  if (p === "/settings") return { title: "Settings", usesPeriod: false, navTo: "/settings" };
  return { title: "Page not found", usesPeriod: false, navTo: null };
}
