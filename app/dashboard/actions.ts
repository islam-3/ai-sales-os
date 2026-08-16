"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";

const VALID_STATUSES = ["new", "sent"] as const;
type LeadStatus = (typeof VALID_STATUSES)[number];

export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status as LeadStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const context = await getCurrentTenant();
  if (!context) {
    throw new Error("You must be signed in to do this");
  }
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("lead_profile")
    .update({ status })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to update lead status:", error);
    throw new Error("Failed to update status");
  }

  revalidatePath("/dashboard");
}
