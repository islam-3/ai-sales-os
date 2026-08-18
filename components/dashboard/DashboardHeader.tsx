"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "@/components/theme-toggle";

// Ordered by how often it's reached for, and by scope: the day-to-day
// work first, then business configuration, then the owner's own account.
// Profile is separated by a divider because it's personal rather than
// business scope — the same reason it sits last.
const NAV_LINKS = [
  { href: "/dashboard", label: "Leads" },
  { href: "/dashboard/business", label: "Business" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/profile", label: "Profile", startsGroup: true },
];

export function DashboardHeader({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-container items-center gap-6 px-page-x py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            {clinicName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            {clinicName}
          </span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <div key={link.href} className="flex items-center">
                {link.startsGroup && <span aria-hidden className="mx-2 h-4 w-px bg-border" />}
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
