import type { ReactNode } from "react";

// One settings card, shared by the Business and Profile pages: title and description at the top, fields beneath
// them, and the action anchored in a footer strip at the bottom edge.
//
// Everything sits in a single centred column (see DashboardShell's
// contentWidth="narrow"), which is what makes the page read as
// deliberate — a heading column beside the fields left too much empty
// space to look intentional, and a left-aligned card on a wide page
// looked stranded.
//
// The footer is a real bordered edge rather than a button floating in
// whitespace, and it gives short status messages a fixed home opposite
// the button, so nothing shifts when one appears.
export function SectionCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-card-p">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">{children}</div>
      </div>

      {footer && (
        <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-card-p py-3">
          {footer}
        </div>
      )}
    </section>
  );
}

// Keeps the footer's two-slot shape (status on the left, action on the
// right) identical across all three cards, including when there's no
// status to show — the empty span holds the button against the right edge.
export function SectionCardFooter({
  status,
  children,
}: {
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="min-w-0 text-sm">{status ?? <span />}</div>
      <div className="shrink-0">{children}</div>
    </>
  );
}
