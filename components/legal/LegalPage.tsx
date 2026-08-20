import type { ReactNode } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────
// ⚠️  Shared shell for the public legal pages (/privacy, /terms).
//
// Both pages are DRAFTS written by a developer, not a lawyer, and both
// must carry the same visible draft banner. Keeping the shell in one
// place means the banner, tone, and cross-links can't drift apart as
// either page is edited.
// ─────────────────────────────────────────────────────────────────────

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function LegalPage({
  title,
  subtitle,
  /** The sibling legal page to cross-link to at the bottom. */
  otherDoc,
  children,
}: {
  title: string;
  subtitle: string;
  otherDoc: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-page-x py-page-y">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

        {/* Visible counterpart to the code comments in each page — both
            visitors and the business owner should be able to see at a
            glance that this hasn't been through legal review. */}
        <p className="mt-6 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-warning">
          <span className="font-medium">Draft notice.</span> This is a working draft, not legal
          advice, and it has not been reviewed by a legal professional. If you operate this
          service, have it reviewed and completed before relying on it.
        </p>

        {children}

        {/* Only the sibling document is linked here. There is deliberately
            no "back to home": these pages are opened in a new tab from the
            chat, and their main audience is visitors rather than business
            owners — so the only destination currently behind "/" (which
            forwards to the dashboard, and from there to a login screen)
            would be actively confusing for them. Add a home link back once
            a real marketing landing page exists. */}
        <div className="mt-10 border-t pt-6 text-sm text-muted-foreground">
          <Link href={otherDoc.href} className="font-medium text-brand hover:underline">
            {otherDoc.label}
          </Link>
        </div>
      </main>
    </div>
  );
}
