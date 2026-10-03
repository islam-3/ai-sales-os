import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidSessionId } from "@/lib/constants";
import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { RESUME_WINDOW_MS } from "@/lib/resume";

// Gives a returning visitor their conversation back.
//
// A visitor who reloaded the page lost everything. Most will not retype
// it, so the lead is gone; the ones who do produce a SECOND lead_profile
// row, and the team calls the same person twice.
//
// ── What this will and will not return ───────────────────────────────
// The transcript, and nothing else. Not the lead, not its score, not the
// qualification data, not the computed state. This is a NEW read surface
// for conversation history — before it existed, a session id lived only
// in one tab's memory and no request could read a transcript back — so
// what it exposes is a deliberate decision rather than whatever happened
// to be on the row.
//
// Two things have to match: an unguessable session UUID and the tenant
// slug it belongs to. The slug is not a secret and adds no entropy; it
// is there so a session id cannot be replayed against a different
// tenant, and so a mismatch is a flat refusal rather than an empty
// transcript that looks like an expiry.
//
// ── Why there is an expiry at all ────────────────────────────────────
// Coming back two days later is reasonably a fresh conversation: their
// situation may have changed, and a stale transcript confuses both the
// visitor and the model reading it as history. It also bounds a billing
// edge — metering is idempotent per session id, so a session kept alive
// for ever is one conversation the tenant is billed for.
//
// Measured from the FIRST message rather than the last, so a long
// conversation cannot extend its own window indefinitely.
//
// This does NOT solve duplicate leads beyond the window. A visitor
// returning on day three still starts fresh and still becomes a second
// lead. That needs a separate long-lived visitor id, which links leads
// without resuming anything — see the note in lib/resume.ts.

export const dynamic = "force-dynamic";

/**
 * A crude per-instance cap, described honestly.
 *
 * This is a serverless function: the map lives in one instance's memory,
 * instances come and go, and a determined caller spreading requests
 * across them is not stopped by this. It is not the security boundary
 * and must never be mistaken for one — the session UUID is. What it does
 * buy is that a single client cannot sit in a loop hammering the
 * database, which is the realistic failure, and it costs nothing.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Bounded, so a long-lived instance cannot grow this map without
    // limit on the back of distinct keys it will never see again.
    if (hits.size > 10_000) {
      for (const [k, v] of Array.from(hits.entries())) {
        if (now > v.resetAt) hits.delete(k);
      }
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  let slug: unknown;
  let sessionId: unknown;
  try {
    ({ slug, sessionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof slug !== "string" || !slug.trim() || !isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`${ip}:${slug}`)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data, error } = await supabaseServer
    .from("conversations")
    .select("role, content, created_at")
    .eq("tenant_id", tenant.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load conversation for resume:", error);
    // Not a 500: the page must still open and start a new conversation.
    // A visitor who cannot resume has lost nothing they had a minute ago,
    // and a chat that refuses to load has lost the lead outright.
    return NextResponse.json({ messages: [], resumed: false });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ messages: [], resumed: false });
  }

  const startedAt = new Date(rows[0].created_at ?? Date.now()).getTime();
  if (Date.now() - startedAt > RESUME_WINDOW_MS) {
    return NextResponse.json({ messages: [], resumed: false, expired: true });
  }

  return NextResponse.json({
    resumed: true,
    messages: rows.map((r) => ({
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
      at: r.created_at,
    })),
  });
}
