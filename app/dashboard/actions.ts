"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_STATUSES = ["new", "contacted", "qualified", "converted"] as const;
type LeadStatus = (typeof VALID_STATUSES)[number];

export async function updateLeadStatus(leadId: string, status: string) {
  if (!VALID_STATUSES.includes(status as LeadStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const { error } = await supabaseServer
    .from("lead_profile")
    .update({ status })
    .eq("id", leadId);

  if (error) {
    console.error("Failed to update lead status:", error);
    throw new Error("Failed to update status");
  }

  revalidatePath("/dashboard");
}
