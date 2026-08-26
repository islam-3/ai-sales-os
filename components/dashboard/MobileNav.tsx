"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_LINKS } from "@/lib/dashboard-nav";

// Mobile navigation drawer, shown below `md` in place of the horizontal
// top nav.
//
// Built on Radix Dialog rather than a hand-rolled panel: it brings focus
// trapping, Escape-to-close, body scroll locking and the right ARIA
// wiring, all of which are easy to get subtly wrong and invisible when
// they're broken.
export function MobileNav({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Next.js routes on the client without unmounting this component, so
  // without this the drawer stays open on top of the page just navigated
  // to. Keyed on pathname so it closes on any successful navigation,
  // including one triggered from outside the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />

        <DialogPrimitive.Content
          // A left-side sheet rather than a centred modal: it opens from
          // the same edge as the button that summons it, which is the
          // conventional position in a left-to-right interface. Capped at
          // 20rem but never wider than the viewport, so the drawer itself
          // can't become a new source of horizontal overflow.
          className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col border-r bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Navigation menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Links to each area of your dashboard, plus theme and sign out.
          </DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
              {clinicName}
            </span>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <div key={link.href} className="contents">
                  {link.startsGroup && <span aria-hidden className="my-1.5 h-px bg-border" />}
                  <Link
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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

          <div className="flex flex-col gap-1 border-t p-3">
            <ThemeToggle variant="row" />
            <LogoutButton className="h-9 w-full justify-start px-3" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
