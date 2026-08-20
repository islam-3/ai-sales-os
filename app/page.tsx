import { redirect } from "next/navigation";

// ─────────────────────────────────────────────────────────────────────
// TEMPORARY — the real marketing landing page is still to be built.
//
// This replaced the default Next.js starter template, which was still
// live at "/" and looked broken to anyone who landed on it.
//
// It redirects to /dashboard rather than branching on auth itself:
// middleware.ts already owns the "are you allowed into /dashboard?"
// decision and sends signed-out visitors to /login. Duplicating that
// check here would give us two places that could disagree about auth.
// So a signed-in owner lands on their dashboard, and everyone else is
// forwarded to /login by the middleware.
//
// When the marketing site is built, replace this whole file with the
// real landing page — and note that public pages then get a genuine
// "home" to link back to (see components/legal/LegalPage.tsx, where the
// home link was removed for exactly this reason).
// ─────────────────────────────────────────────────────────────────────

export default function RootPage() {
  redirect("/dashboard");
}
