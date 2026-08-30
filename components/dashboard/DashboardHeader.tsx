"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/Logo";
import { NAV_LINKS } from "@/lib/dashboard-nav";

// Two layouts from one header.
//
// At `md` and above this is the horizontal bar it has always been. Below
// it, the nav and the trailing controls are replaced by a hamburger that
// opens MobileNav — five links plus a theme toggle and a sign-out button
// simply do not fit on a phone, and the flex row they lived in refused to
// shrink (flex items default to min-width: auto), pushing the whole page
// wider than the viewport and letting it drag sideways.
//
// The business name stays visible at every width; it just gains min-w-0
// and truncate so a long one can't reintroduce that same overflow.
export function DashboardHeader({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-container items-center gap-3 px-page-x py-3 md:gap-6">
        {/* Menu button first in the DOM as well as visually, so it's the
            first thing reached by keyboard and screen reader on mobile.
            It renders nothing at md and above. The drawer itself is
            portalled to the body, so its position here doesn't affect
            where the panel appears. */}
        <MobileNav clinicName={clinicName} />

        {/* Platform brand, then the tenant's own. Grouped together with a
            single gap so the hairline gets equal space on both sides —
            nesting them under the header's own gap would have left it
            12px from the mark and 24px from the tenant.

            The monogram only, never the wordmark: on this page Naroxe is
            chrome and the business is the subject, so the mark sits at
            20px against the tenant's 32px badge and bold name. Both brand
            elements are hidden below md — the far-left slot there belongs
            to the hamburger, and adding a third item at 375px is how the
            header overflowed in the first place. Mobile gets the full
            lockup in the drawer footer instead. */}
        <div className="flex min-w-0 items-center gap-3">
          <Logo
            variant="mark"
            size="lg"
            className="hidden shrink-0 text-naroxe-ink md:block"
          />
          <span
            aria-hidden
            className="hidden h-5 w-px shrink-0 bg-naroxe-silver/70 md:block"
          />

          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
              {clinicName.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {clinicName}
            </span>
          </div>
        </div>

        {/* Desktop navigation — unchanged from the original layout. */}
        <nav className="hidden items-center gap-0.5 md:flex">
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

        {/* Theme and sign-out move inside the drawer on mobile, so the
            header keeps only the menu button and the business name. */}
        <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
