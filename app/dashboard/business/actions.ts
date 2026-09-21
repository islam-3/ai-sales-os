"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidBrandColor } from "@/lib/branding";
import { anthropic } from "@/lib/anthropic";
import { recordUsage } from "@/lib/usage";
import {
  CHAT_INTRO_SOURCE,
  blockedFromPublishing,
  buildChatIntroTranslationPrompt,
  chatIntroSourceHash,
  validateTranslation,
} from "@/lib/chat-intro-i18n";
import { detectScript, scriptForLanguage } from "@/lib/visitor-language";

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

// ── Chat greeting translation ────────────────────────────────────────────

// One-off per language, written once and then read by every visitor, so
// it runs on the conversation model rather than the cheap one. Quality
// here is a shop window.
const TRANSLATION_MODEL = "claude-sonnet-4-6";

/**
 * Translates the fixed greeting and chip strings into the tenant's chat
 * language and stores them UNAPPROVED.
 *
 * Unapproved is the point. The owner speaks the language and we do not,
 * so nothing generated here reaches a visitor until they have read it.
 * Until then the chat falls back to a hand-written translation, or to
 * English.
 */
export async function generateChatIntroTranslation(): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read settings for greeting translation:", readError);
    return { ok: false, error: "Could not read your settings." };
  }

  const settings = parseTenantSettings(current.settings);
  const language = settings.chat_language?.trim();
  if (!language) return { ok: false, error: "Choose a chat language first." };

  try {
    const response = await anthropic.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 1024,
      system: buildChatIntroTranslationPrompt(language),
      messages: [{ role: "user", content: `Translate into ${language}.` }],
    });

    void recordUsage({
      tenantId,
      callType: "chat_intro_translation",
      provider: "anthropic",
      model: TRANSLATION_MODEL,
      tokens: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    const block = response.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text : "";
    const jsonText = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error("Greeting translation was not valid JSON:", raw.slice(0, 200));
      return { ok: false, error: "The translation came back malformed. Try again." };
    }

    // Rejected rather than repaired. A translation that has lost its
    // {business} placeholder, or had a real clinic name substituted into
    // it, would be stored and shown to every visitor of this tenant.
    const strings = validateTranslation(parsed);
    if (!strings) {
      console.error("Greeting translation failed validation:", JSON.stringify(parsed).slice(0, 300));
      return { ok: false, error: "The translation came back malformed. Try again." };
    }

    const merged = parseTenantSettings({
      ...settings,
      chat_intro: {
        language,
        sourceHash: chatIntroSourceHash(),
        strings,
        source: { ...CHAT_INTRO_SOURCE },
        approved: false,
      },
    });

    const { error } = await supabase.from("tenants").update({ settings: merged }).eq("id", tenantId);
    if (error) {
      console.error("Failed to store greeting translation:", error);
      return { ok: false, error: "Could not save the translation." };
    }

    revalidatePath("/dashboard/business");
    return { ok: true };
  } catch (err) {
    console.error("Greeting translation call failed:", err);
    return { ok: false, error: "The translation service did not respond. Try again." };
  }
}

/**
 * Saves the owner's reviewed wording, and whether it is live.
 *
 * Their edits win over anything generated: they are the ones who speak
 * the language.
 */
export async function saveChatIntroTranslation(
  strings: Record<string, string>,
  approved: boolean
): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const validated = validateTranslation(strings);
  if (!validated) {
    return {
      ok: false,
      error: "Keep {business} and {place} exactly as they are — they become your name and city.",
    };
  }

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read settings for greeting save:", readError);
    return { ok: false, error: "Could not read your settings." };
  }

  const settings = parseTenantSettings(current.settings);
  const language = settings.chat_language?.trim();
  if (!language) return { ok: false, error: "Choose a chat language first." };

  // Checked here and not only in the card, because a disabled button is a
  // suggestion. Publishing English as an Arabic greeting is the one
  // mistake in this flow that reaches every visitor silently.
  if (approved) {
    const blocked = blockedFromPublishing(
      language,
      validated,
      (text) => detectScript([text]),
      scriptForLanguage
    );
    if (blocked === "unchanged-from-english") {
      return {
        ok: false,
        error: `This is still the English wording. Generate a ${language} translation before making it live.`,
      };
    }
    if (blocked === "wrong-script") {
      return {
        ok: false,
        error: `This greeting does not look like ${language}. Check the wording before making it live.`,
      };
    }
  }

  const merged = parseTenantSettings({
    ...settings,
    chat_intro: {
      language,
      sourceHash: chatIntroSourceHash(),
      strings: validated,
      source: { ...CHAT_INTRO_SOURCE },
      approved,
    },
  });

  const { error } = await supabase.from("tenants").update({ settings: merged }).eq("id", tenantId);
  if (error) {
    console.error("Failed to save greeting translation:", error);
    return { ok: false, error: "Could not save your changes." };
  }

  revalidatePath("/dashboard/business");
  revalidatePath("/chat", "layout");
  return { ok: true };
}
