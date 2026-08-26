// The dashboard's navigation items, shared by the desktop top bar and the
// mobile drawer so the two can never drift apart.
//
// Ordered by how often it's reached for, and by scope: the day-to-day
// work first, then business configuration, then billing and the owner's
// own account. `startsGroup` marks where that shift happens — the desktop
// bar draws a divider there, the drawer a separator.

export type DashboardNavLink = {
  href: string;
  label: string;
  startsGroup?: boolean;
};

export const NAV_LINKS: DashboardNavLink[] = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/business", label: "Business" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/billing", label: "Plan", startsGroup: true },
  { href: "/dashboard/profile", label: "Profile" },
];
