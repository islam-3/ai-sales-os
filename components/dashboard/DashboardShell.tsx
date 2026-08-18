import type { ReactNode } from "react";
import { DashboardHeader } from "./DashboardHeader";

// The single definition of the dashboard page frame: header, page
// background, container width, and page gutters. Both /dashboard and
// /dashboard/settings render through this so spacing and rhythm can't
// drift apart between them.
//
// No `dark` class here — the theme now lives on <html>, driven by
// next-themes, so every surface follows the user's choice.
export function DashboardShell({
  clinicName,
  title,
  description,
  headerSlot,
  contentWidth = "default",
  children,
}: {
  clinicName: string;
  title: ReactNode;
  description?: ReactNode;
  /** Rendered between the header and the page title (e.g. the chat link card). */
  headerSlot?: ReactNode;
  /**
   * "default" fills the page container — right for data-dense views like
   * Leads. "narrow" centres a reading-width column, for form pages where
   * full-width fields would be uncomfortably long.
   *
   * The title sits inside this column too, so it always lines up with the
   * content beneath it rather than being stranded off to the left.
   */
  contentWidth?: "default" | "narrow";
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader clinicName={clinicName} />

      <main className="mx-auto max-w-container px-page-x py-page-y">
        <div className={contentWidth === "narrow" ? "mx-auto w-full max-w-2xl" : undefined}>
          {headerSlot}

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

// Shown when a signed-in session has no resolvable tenant. Uses the same
// frame vocabulary as the shell so it doesn't look like a crash page.
export function DashboardMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-page-x">
      <div className="max-w-sm rounded-xl border bg-card p-card-p text-center shadow-sm">
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
