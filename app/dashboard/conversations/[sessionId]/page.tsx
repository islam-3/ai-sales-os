import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";

// A conversation an owner is reading now, so never cached.
export const dynamic = "force-dynamic";

/**
 * Where "Back" goes, keyed by the page that linked here.
 *
 * Two pages open a conversation now, and a back link that names the wrong
 * one sends an owner reading a lead to the knowledge base. The linking
 * page says where it is (?from=leads or ?from=questions). Anything else,
 * or nothing, falls back to leads: that is the page most visits here
 * start from, and an unknown value from a hand-edited URL must not pick
 * a destination.
 */
const BACK_LINKS = {
  leads: { href: "/dashboard", label: "Back to leads" },
  questions: { href: "/dashboard/settings", label: "Back to the knowledge base" },
} as const;

function backLinkFor(from: string | string[] | undefined) {
  return from === "questions" ? BACK_LINKS.questions : BACK_LINKS.leads;
}

/**
 * One conversation, read-only.
 *
 * This exists because the captured-questions list promises a link to the
 * conversation, and until now the dashboard had no way to show one —
 * leads did not even carry a session id. A line saying "9 customers
 * asked about instalments" is worth far less if the owner cannot see
 * what the ninth of them actually wrote.
 *
 * ── Untranslated, deliberately ──────────────────────────────────────
 * The visitor's own words, in their own language, exactly as typed. The
 * dashboard list above shows a short version in the team's language with
 * personal details stripped; this is the opposite end of that trade and
 * is the reason stripping them there costs nothing. Tone, hesitation and
 * exact wording are evidence, and a mistranslated "I have diabetes" is a
 * real risk.
 *
 * Access is RLS: the query runs through the owner's own authenticated
 * client, and the policy on conversations restricts it to tenants they
 * own. A session id from another tenant returns nothing rather than
 * someone else's chat.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { sessionId } = await params;
  const back = backLinkFor((await searchParams).from);
  const context = await getCurrentTenant();

  if (!context) {
    return (
      <DashboardMessage>
        We couldn&apos;t find a business for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { supabase, tenantId, businessName } = context;

  const { data: rows, error } = await supabase
    .from("conversations")
    .select("id, role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return (
    <DashboardShell
      businessName={businessName}
      title="Conversation"
      description="What this customer wrote, in their own words and their own language."
    >
      <div className="flex flex-col gap-5">
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {back.label}
        </Link>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-card-p text-sm text-destructive">
            Failed to load this conversation: {error.message}
          </p>
        )}

        {!error && (rows ?? []).length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              This conversation is no longer available.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {(rows ?? []).map((row) => {
            const isVisitor = row.role !== "assistant";
            return (
              <div
                key={row.id}
                className={`flex ${isVisitor ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl border px-4 py-2.5 ${
                    isVisitor ? "bg-card" : "bg-muted/40"
                  }`}
                >
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {isVisitor ? "Customer" : "Assistant"}
                  </p>
                  {/*
                    dir="auto" per message, not on the container. The
                    customer may write Arabic while the assistant replies
                    in Arabic and a later turn arrives in English; one
                    direction for the whole page gets at least one of
                    them wrong. The browser decides per message from its
                    first strong character.
                  */}
                  <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {row.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
