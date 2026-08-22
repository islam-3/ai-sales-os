import { supabaseServer } from "./supabase-server";

/**
 * Counts one conversation against the tenant's current billing period.
 *
 * Safe to call more than once for the same session: the underlying
 * function is idempotent per (tenant_id, session_id), enforced by a
 * unique constraint rather than a read-then-write check, so concurrent
 * first messages can't double-count.
 *
 * Never throws. Metering exists to bill correctly, not to gate service —
 * if it fails, the visitor's conversation must still go through. An
 * undercount is recoverable from the chat_sessions rows; a failed
 * conversation isn't.
 *
 * Uses the service_role client deliberately: visitors are anonymous, and
 * execute on the function is granted to service_role alone so nobody can
 * inflate or roll another tenant's counter.
 */
export async function recordConversationStart(
  tenantId: string,
  sessionId: string
): Promise<void> {
  try {
    const { error } = await supabaseServer.rpc("record_conversation_start", {
      p_tenant_id: tenantId,
      p_session_id: sessionId,
    });

    if (error) {
      console.error("Failed to record conversation start:", error);
    }
  } catch (err) {
    console.error("Failed to record conversation start:", err);
  }
}
