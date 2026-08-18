"use server";

import { supabaseServer } from "@/lib/supabase-server";

// Postgres' unique_violation error code — used to detect a slug collision
// and retry with the next suffix, rather than racily checking-then-inserting.
const UNIQUE_VIOLATION = "23505";
const MAX_SLUG_ATTEMPTS = 25;

function slugify(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "clinic";
}

// Inserts a new tenant row owned by the given auth user, generating a slug
// from the business name and appending -2, -3, ... on collision. Relies on
// the tenants.slug unique constraint (and retrying on 23505) rather than a
// check-then-insert, so two concurrent signups with the same business name
// can't both "pass" a pre-check and then collide anyway.
async function insertTenantWithUniqueSlug(
  businessName: string,
  industry: string | null,
  ownerUserId: string
) {
  const base = slugify(businessName);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;

    const { data, error } = await supabaseServer
      .from("tenants")
      .insert({
        business_name: businessName,
        slug,
        industry,
        owner_user_id: ownerUserId,
      })
      .select("id")
      .single();

    if (!error) return data;

    if (error.code !== UNIQUE_VIOLATION) {
      throw error;
    }
    // Collision on slug — loop and try the next suffix.
  }

  throw new Error("Could not generate a unique business slug. Please try a different name.");
}

// Read-only preview of the slug insertTenantWithUniqueSlug would assign
// right now for this business name — same base-then--2,-3,... sequence,
// just checked with a single SELECT instead of an INSERT-and-retry loop
// (there's nothing to retry against yet since nothing is being written).
// Called from the signup form as the user types, so they see their real
// chat link slug before submitting rather than being surprised by it.
//
// This is inherently best-effort: another signup could take the same
// slug between this preview and the real submit. That's fine — the
// actual collision safety still comes from insertTenantWithUniqueSlug's
// retry-on-unique-violation loop at signup time, not from this preview.
export async function previewSlug(businessName: string): Promise<string> {
  const base = slugify(businessName.trim());

  const { data, error } = await supabaseServer.from("tenants").select("slug").like("slug", `${base}%`);

  if (error) {
    console.error("Failed to check slug availability for preview:", error);
    return base;
  }

  const existingSlugs = new Set((data ?? []).map((row) => row.slug));
  if (!existingSlugs.has(base)) return base;

  for (let attempt = 1; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = `${base}-${attempt + 1}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }

  return base;
}

// Called right after a successful supabase.auth.signUp() on the client.
// Creates the new tenant row for that user. If it fails, the auth user is
// deleted so the signup isn't left half-done — the user can just try
// signing up again with the same email instead of being stuck with an
// account that has no tenant.
export async function createTenantForNewUser(
  ownerUserId: string,
  businessName: string,
  industry?: string
): Promise<{ ok: true }> {
  const trimmedName = businessName.trim();
  if (!trimmedName) {
    throw new Error("Business name is required");
  }

  try {
    // Captured at signup so a tenant is never live with a null industry —
    // the chat assistant derives its whole persona from it.
    await insertTenantWithUniqueSlug(trimmedName, industry?.trim() || null, ownerUserId);
  } catch (err) {
    console.error("Failed to create tenant for new user, rolling back auth user:", err);
    const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(ownerUserId);
    if (deleteError) {
      console.error("Failed to roll back auth user after tenant creation failure:", deleteError);
    }
    throw new Error("Failed to set up your account. Please try signing up again.");
  }

  return { ok: true };
}
