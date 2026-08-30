"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidBrandColor } from "@/lib/branding";

export type BusinessIdentityInput = {
  businessName: string;
  industry: string;
  description: string;
};

// Saves the typed identity columns. Scoped with .eq("tenant_id"-equivalent)
// via the session client, so RLS plus the explicit id filter both have to
// agree the caller owns this row.
export async function updateBusinessIdentity(input: BusinessIdentityInput): Promise<void> {
  const businessName = input.businessName.trim();
  if (!businessName) throw new Error("Business name is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("tenants")
    .update({
      business_name: businessName,
      // Empty inputs are stored as null rather than "", so the prompt
      // builder's "is this present?" checks stay simple.
      industry: input.industry.trim() || null,
      description: input.description.trim() || null,
    })
    .eq("id", tenantId);

  if (error) {
    console.error("Failed to update business identity:", error);
    throw new Error("Failed to save business details");
  }

  revalidatePath("/dashboard/business");
  // The header and chat page both render business_name, so they need to
  // pick up a rename too.
  revalidatePath("/dashboard", "layout");
}

// Merges a partial settings object over whatever is already stored, so
// each card on the page can save independently without clobbering fields
// owned by the other cards.
export async function updateBusinessSettings(patch: TenantSettings): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read current settings:", readError);
    throw new Error("Failed to save business details");
  }

  // Re-parsed on the way out so anything malformed already in the column
  // is normalised rather than merged forward.
  const merged = parseTenantSettings({ ...parseTenantSettings(current.settings), ...patch });

  const { error } = await supabase.from("tenants").update({ settings: merged }).eq("id", tenantId);

  if (error) {
    console.error("Failed to update business settings:", error);
    throw new Error("Failed to save business details");
  }

  revalidatePath("/dashboard/business");
}

// ── Brand identity: logo + colour ────────────────────────────────────────

const BRANDING_BUCKET = "business-media";
// Logos are small by nature; anything larger is a photo uploaded by
// mistake and would only slow the public chat page down.
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

// Same reasoning as uploadKnowledgeMedia in settings/actions.ts: Storage
// is governed by its own policy system on storage.objects, separate from
// the public.* RLS policies. No Storage policies exist for this bucket
// yet, so the service_role client is what actually works here. Ownership
// is still enforced — getCurrentTenant() resolves the tenant from the
// signed-in user, and the path is namespaced by that tenant id.
function logoStoragePath(url: string): string | null {
  const marker = `/object/public/${BRANDING_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

// Best-effort removal of a superseded logo. A failure here is logged and
// swallowed: an orphaned file in the bucket is untidy, but failing the
// whole save because cleanup didn't work would be worse for the owner.
async function removeLogoObject(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = logoStoragePath(url);
  if (!path) return;

  const { error } = await supabaseServer.storage.from(BRANDING_BUCKET).remove([path]);
  if (error) {
    console.error("Failed to remove previous logo from Storage:", error);
  }
}

export type BrandingResult = {
  logoUrl: string | null;
  brandColor: string | null;
  chatTheme: "light" | "dark";
};

// Saves the logo and/or brand colour. Both are optional and independent:
// an owner can set a colour with no logo, a logo with no colour, or clear
// either one back to the default.
export async function updateBusinessBranding(formData: FormData): Promise<BrandingResult> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("logo_url, brand_color")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read current branding:", readError);
    throw new Error("Failed to save your brand settings");
  }

  const removeLogo = formData.get("removeLogo") === "true";
  const file = formData.get("logo");
  const rawColor = String(formData.get("brandColor") ?? "").trim();

  // An empty colour field means "use the default", stored as null rather
  // than as the default's literal hex — so if the default ever changes,
  // every tenant who never chose a colour follows it.
  let brandColor: string | null = null;
  if (rawColor) {
    const normalised = rawColor.toUpperCase();
    if (!isValidBrandColor(normalised)) {
      throw new Error("Brand colour must be a 6-digit hex value, like #1D4ED8.");
    }
    brandColor = normalised;
  }

  let logoUrl: string | null = current.logo_url ?? null;

  if (removeLogo) {
    await removeLogoObject(current.logo_url);
    logoUrl = null;
  } else if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Your logo must be an image file.");
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new Error("That logo is too large — please keep it under 4MB.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "logo";
    const path = `${tenantId}/branding/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseServer.storage
      .from(BRANDING_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Failed to upload logo:", uploadError);
      throw new Error("Failed to upload the logo. Please try again.");
    }

    const { data } = supabaseServer.storage.from(BRANDING_BUCKET).getPublicUrl(path);

    // Only remove the old file after the new one is safely stored, so a
    // failed upload never leaves the tenant with no logo at all.
    await removeLogoObject(current.logo_url);
    logoUrl = data.publicUrl;
  }

  const rawTheme = String(formData.get("chatTheme") ?? "light");
  const chatTheme: "light" | "dark" = rawTheme === "dark" ? "dark" : "light";

  // Read-modify-write on the jsonb column so the other settings cards
  // (location, contact, hours, onboarding) aren't clobbered by this save.
  const { data: currentSettings, error: settingsReadError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (settingsReadError || !currentSettings) {
    console.error("Failed to read current settings:", settingsReadError);
    throw new Error("Failed to save your brand settings");
  }

  const mergedSettings = parseTenantSettings({
    ...parseTenantSettings(currentSettings.settings),
    chat_theme: chatTheme,
  });

  const { error } = await supabase
    .from("tenants")
    .update({ logo_url: logoUrl, brand_color: brandColor, settings: mergedSettings })
    .eq("id", tenantId);

  if (error) {
    console.error("Failed to update branding:", error);
    throw new Error("Failed to save your brand settings");
  }

  revalidatePath("/dashboard/business");
  // The public chat page renders both of these.
  revalidatePath("/chat", "layout");

  return { logoUrl, brandColor, chatTheme };
}
