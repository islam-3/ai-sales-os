"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { type SessionClient } from "@/lib/supabase-session";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidBrandColor } from "@/lib/branding";
import { anthropic } from "@/lib/anthropic";
import { recordUsage } from "@/lib/usage";
import { SOURCE_LANGUAGE_CODE, translationSourceFor } from "@/lib/chat-intro-i18n";
import { languageName, resolveLanguageCode } from "@/lib/languages";
import {
  buildGreetingSuggestionPrompt,
  buildGreetingTranslationPrompt,
} from "@/lib/greeting-prompts";
import { classifyModelError } from "@/lib/model-errors";

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

// ─────────────────────────────────────────────────────────────────────
// The greeting, as one message and a list of buttons
//
// Replaces generateChatIntroTranslation / saveChatIntroTranslation,
// which worked on fifteen separately translatable strings. Those are
// kept for reading old rows (see buildChatIntro) but nothing writes them
// any more.
// ─────────────────────────────────────────────────────────────────────

/** The categories a tenant has written about, for context and chips. */
async function tenantCategories(
  supabase: SessionClient,
  tenantId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("knowledge_base")
    .select("category")
    .eq("tenant_id", tenantId)
    .not("category", "is", null);
  return Array.from(
    new Set((data ?? []).map((r: { category: string | null }) => r.category ?? "").filter(Boolean))
  );
}

/**
 * Drafts a welcome message from the business's own details.
 *
 * Returns the text for the owner to edit. Deliberately does NOT save:
 * nothing a model wrote goes live without the owner having had it in
 * front of them, and the only way to guarantee that is for this to hand
 * back a string rather than write a row.
 *
 * It does not touch the chips either — see lib/greeting-prompts.ts for
 * why that is a decision rather than an omission.
 */
export async function suggestGreeting(): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: tenant, error: readError } = await supabase
    .from("tenants")
    .select("business_name, industry, description, settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (readError || !tenant) {
    console.error("Failed to read tenant for greeting suggestion:", readError);
    return { ok: false, error: "Could not read your business details." };
  }

  const settings = parseTenantSettings(tenant.settings);
  const language = settings.chat_language?.trim() || SOURCE_LANGUAGE_CODE;

  try {
    const response = await anthropic.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 500,
      system: buildGreetingSuggestionPrompt({
        businessName: tenant.business_name,
        industry: tenant.industry,
        description: tenant.description,
        city: settings.location?.city ?? null,
        country: settings.location?.country ?? null,
        categories: await tenantCategories(supabase, tenantId),
        language: languageName(language) || language,
      }),
      messages: [{ role: "user", content: "Write it." }],
    });

    void recordUsage({
      tenantId,
      callType: "greeting_suggestion",
      provider: "anthropic",
      model: TRANSLATION_MODEL,
      tokens: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    const block = response.content.find((b) => b.type === "text");
    const text = (block?.type === "text" ? block.text : "").trim();
    if (!text) return { ok: false, error: "Nothing came back. Nothing was changed. Try again." };

    // Stripped of the quotes a model sometimes wraps prose in, because
    // the owner would otherwise have to delete them by hand every time.
    const cleaned = text.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();
    return { ok: true, text: cleaned };
  } catch (err) {
    const failure = classifyModelError(err);
    console.error("Greeting suggestion failed:", {
      kind: failure.kind,
      status: failure.status,
      tenantId,
      detail: failure.detail,
    });
    return { ok: false, error: failure.ownerMessage };
  }
}

/**
 * Translates the owner's existing greeting into the chat language.
 *
 * ── The source is chosen HERE, from stored state ────────────────────
 * It used to translate whatever was in the editor into the chat
 * language, with no notion of a source: on a tenant whose chat language
 * was English and whose greeting was English, it offered to translate
 * English into English.
 *
 * The source is now translationSourceFor's answer — the most recent
 * greeting the owner authored, in preference to any translation — and
 * it is decided on the server rather than taken from the client, so the
 * label the owner read and the text actually sent cannot disagree.
 *
 * Stored UNAPPROVED, which is the one case approval exists for: words
 * we produced in a language we cannot check. Everything the owner types
 * is theirs and goes live on save.
 */
export async function translateGreeting(): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const languageForModel = languageName(language) || language;

  // Nothing to translate is not an error the owner can act on — the
  // button should not have been there. Reported plainly rather than as
  // a failure.
  const source = translationSourceFor(settings.chat_intro?.greetings, language);
  if (!source) {
    return {
      ok: false,
      error: `There is nothing to translate — your welcome message is already in ${languageForModel}.`,
    };
  }
  const trimmed = source.greeting.text.trim();
  const chips = source.greeting.chips ?? [];

  try {
    const response = await anthropic.messages.create({
      model: TRANSLATION_MODEL,
      max_tokens: 900,
      system: buildGreetingTranslationPrompt({ text: trimmed, chips, language: languageForModel }),
      messages: [
        {
          role: "user",
          content: JSON.stringify({ text: trimmed, chips }),
        },
      ],
    });

    void recordUsage({
      tenantId,
      callType: "greeting_translation",
      provider: "anthropic",
      model: TRANSLATION_MODEL,
      tokens: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    const block = response.content.find((b) => b.type === "text");
    const raw = (block?.type === "text" ? block.text : "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: { text?: unknown; chips?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Greeting translation was not valid JSON:", raw.slice(0, 200));
      return { ok: false, error: "The translation came back malformed. Nothing was changed. Try again." };
    }

    const translated = typeof parsed.text === "string" ? parsed.text.trim() : "";
    if (!translated) {
      return { ok: false, error: "The translation came back empty. Nothing was changed. Try again." };
    }
    const translatedChips = Array.isArray(parsed.chips)
      ? parsed.chips.filter((c): c is string => typeof c === "string" && !!c.trim()).map((c) => c.trim())
      : chips;

    return await writeGreeting(supabase, tenantId, settings, language, {
      text: translated,
      chips: translatedChips,
      // The one unapproved write in this file. The owner has not read it
      // yet, and it is in a language we cannot check ourselves.
      approved: false,
      origin: "translated",
    });
  } catch (err) {
    const failure = classifyModelError(err);
    console.error("Greeting translation failed:", {
      kind: failure.kind,
      status: failure.status,
      tenantId,
      detail: failure.detail,
    });
    return { ok: false, error: failure.ownerMessage };
  }
}

/**
 * Saves what the owner wrote, live.
 *
 * No approval step: they wrote it, in a language they chose, and read it
 * in the field they typed it into. The review-before-live rule applies
 * to machine output, not to theirs.
 */
export async function saveGreeting(
  text: string,
  chips: string[],
  /** True when this text came from Suggest wording and was not retyped. */
  fromSuggestion = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "A welcome message cannot be empty. Clear nothing and visitors see our default instead.",
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
  const language = settings.chat_language?.trim() || SOURCE_LANGUAGE_CODE;

  // Saved under the CHAT LANGUAGE, whatever language the words are
  // actually in. Deliberately not checked.
  //
  // Knowing would mean reading the prose and guessing its language, and
  // text interpretation is what this card was rebuilt to stop doing —
  // the same reason {business} placeholders are gone. The owner is
  // looking at their own words under "What visitors see" as they type,
  // which is better feedback than any detector we could ship.
  return await writeGreeting(supabase, tenantId, settings, language, {
    text: trimmed,
    chips: chips.map((c) => c.trim()).filter(Boolean),
    approved: true,
    // "suggested" only once the owner has saved what a model drafted;
    // an unsaved suggestion never reaches storage at all.
    origin: fromSuggestion ? "suggested" : "written",
  });
}

/**
 * The one write path, so every caller stores the same shape.
 *
 * Merged into the raw row rather than through the parser's output: the
 * parser is an allowlist, and round-tripping through it would silently
 * drop any settings key it does not yet know about.
 */
async function writeGreeting(
  supabase: SessionClient,
  tenantId: string,
  settings: TenantSettings,
  language: string,
  entry: {
    text: string;
    chips: string[];
    approved: boolean;
    origin: "written" | "suggested" | "translated";
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = resolveLanguageCode(language) ?? language.trim().toLowerCase();

  const { data: row } = await supabase
    .from("tenants")
    .select("settings, business_name")
    .eq("id", tenantId)
    .single();
  const raw = (row?.settings ?? {}) as Record<string, unknown>;
  const chatIntro = (raw.chat_intro ?? {}) as Record<string, unknown>;
  const greetings = { ...((chatIntro.greetings ?? {}) as Record<string, unknown>) };

  greetings[code] = {
    text: entry.text,
    chips: entry.chips,
    approved: entry.approved,
    // Both only ever read by translationSourceFor, to avoid translating
    // a translation. See lib/chat-intro-i18n.ts.
    origin: entry.origin,
    savedAt: Date.now(),
    // The whole of the rename story: what the name and city were when
    // this was written. Compared later to remind the owner, never used
    // to rewrite their words.
    wroteWith: {
      ...(row?.business_name ? { businessName: row.business_name } : {}),
      ...(settings.location?.city || settings.location?.country
        ? { place: settings.location?.city ?? settings.location?.country }
        : {}),
    },
  };

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...raw, chat_intro: { ...chatIntro, greetings } } })
    .eq("id", tenantId);

  if (error) {
    console.error("Failed to save greeting:", error);
    return { ok: false, error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/dashboard/business");
  return { ok: true };
}
