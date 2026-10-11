"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";

/**
 * Hides a question group from the list.
 *
 * Written to the group's CANONICAL row, which is the one row where
 * id = group_id. The check constraint on the table enforces that, so a
 * mistake here fails loudly rather than storing a dismissal nothing
 * reads.
 *
 * Not a delete. The asks stay, which is what lets the group come back
 * once three more customers ask — and what stops a dismissal from
 * quietly destroying the only record that anyone asked at all.
 */
export async function dismissQuestionGroup(groupId: string): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("unanswered_questions")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("group_id", groupId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to dismiss question group:", error);
    throw new Error("Failed to dismiss");
  }

  revalidatePath("/dashboard/settings");
}

/**
 * Puts a dismissed group back, for an owner who changed their mind.
 *
 * Clearing dismissed_at rather than setting a flag: the come-back rule
 * counts asks that arrived after the dismissal, so a cleared dismissal
 * has to leave no timestamp behind for it to count against.
 */
export async function restoreQuestionGroup(groupId: string): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("unanswered_questions")
    .update({ dismissed_at: null })
    .eq("id", groupId)
    .eq("group_id", groupId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to restore question group:", error);
    throw new Error("Failed to restore");
  }

  revalidatePath("/dashboard/settings");
}
