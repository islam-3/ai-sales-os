"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings } from "@/lib/tenant-settings";

// Merges an onboarding flag into settings without disturbing the rest of
// the object. Reused by both flags below rather than duplicating the
// read-merge-write dance — getting that wrong would silently wipe the
// business's location or contact details.
async function setOnboardingFlag(patch: { chat_link_copied?: true; dismissed?: true }) {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read settings for onboarding update:", readError);
    throw new Error("Failed to update getting-started progress");
  }

  const settings = parseTenantSettings(current.settings);
  const merged = {
    ...settings,
    onboarding: { ...(settings.onboarding ?? {}), ...patch },
  };

  const { error } = await supabase.from("tenants").update({ settings: merged }).eq("id", tenantId);

  if (error) {
    console.error("Failed to save onboarding progress:", error);
    throw new Error("Failed to update getting-started progress");
  }

  revalidatePath("/dashboard");
}

// Called when the owner copies (or opens) their chat link — the one
// checklist step that leaves no trace in the data itself.
export async function markChatLinkCopied(): Promise<void> {
  await setOnboardingFlag({ chat_link_copied: true });
}

// Hides the checklist early. Sticky, so it doesn't come back.
export async function dismissOnboarding(): Promise<void> {
  await setOnboardingFlag({ dismissed: true });
}
