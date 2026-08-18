"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_STATUSES = ["new", "sent"] as const;
type LeadStatus = (typeof VALID_STATUSES)[number];

const LEAD_ATTACHMENTS_BUCKET = "lead-attachments";
// Long enough to browse a lead's photos without re-signing on every
// interaction, short enough that a leaked URL stops working quickly.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export type LeadPhoto = {
  path: string;
  /** Plain signed URL — renders inline in an <img>. */
  url: string;
  /**
   * Same signed URL plus `&download=<filename>`, which makes Storage
   * respond with `Content-Disposition: attachment`. That header is what
   * actually forces a save-to-disk: the HTML `download` attribute is
   * ignored for cross-origin URLs, and these are served from the
   * Supabase host, so the attribute alone would just open the image.
   */
  downloadUrl: string;
  filename: string;
};

// "Nadia Rahman" -> "nadia-rahman". Falls back to "lead" so a nameless
// lead still produces a usable filename rather than "-photo-1.png".
function slugifyName(name: string | null): string {
  const slug = (name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "lead";
}

// Pulls the extension off the stored object path so the downloaded file
// keeps its real format. Restricted to a known list so a odd path can't
// inject something strange into the filename.
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif"];

function extensionFor(path: string): string {
  const base = path.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : "jpg";
}

// Returns viewable URLs for a lead's chat-uploaded photos.
//
// The lead-attachments bucket is PRIVATE, so these have to be signed —
// there's no public URL to render. Signing goes through supabaseServer
// (service_role), which bypasses RLS entirely, so this function does the
// authorization itself, in two independent layers:
//
//   1. The lead row is fetched with the session client, filtered by the
//      caller's own tenant_id. RLS plus that filter means a lead id
//      belonging to another tenant simply returns nothing.
//   2. Every stored path is then re-checked against the caller's own
//      `{tenant_id}/` prefix before it is signed. Layer 1 already covers
//      the normal case; this also holds if a path were ever corrupted or
//      written wrong, so a bad row still can't be used to mint a URL for
//      another tenant's file.
export async function getLeadPhotos(leadId: string): Promise<LeadPhoto[]> {
  const context = await getCurrentTenant();
  if (!context) {
    throw new Error("You must be signed in to do this");
  }
  const { supabase, tenantId } = context;

  const { data: lead, error } = await supabase
    .from("lead_profile")
    .select("id, name, qualification_data")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up lead for photos:", error);
    throw new Error("Failed to load photos");
  }
  // Either the lead doesn't exist or it belongs to someone else — both
  // are the same answer from here.
  if (!lead) return [];

  const raw = (lead.qualification_data as { attachments?: unknown } | null)?.attachments;
  const paths = Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string" && p.startsWith(`${tenantId}/`))
    : [];

  if (paths.length === 0) return [];

  const { data: signed, error: signError } = await supabaseServer.storage
    .from(LEAD_ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (signError) {
    console.error("Failed to sign lead attachment URLs:", signError);
    throw new Error("Failed to load photos");
  }

  const nameSlug = slugifyName(lead.name as string | null);

  // createSignedUrls reports per-file errors inline rather than throwing,
  // so a single missing object (deleted from the bucket but still listed
  // on the lead) degrades to "that one is skipped" instead of failing the
  // whole set.
  //
  // The download URL is built by appending `&download=` to the signed URL
  // rather than signing a second time. Storage treats `download` as an
  // ordinary query param applied after signing — it isn't covered by the
  // token — which is exactly how the SDK's own `download` option works.
  // Doing it here keeps the single batch signing call while still giving
  // each photo its own filename, which the batch API can't do (it takes
  // one download name for every path).
  return (signed ?? []).flatMap((item, index) => {
    if (item.error || !item.signedUrl) {
      console.error("Could not sign lead attachment:", item.path, item.error);
      return [];
    }
    const path = item.path ?? "";
    const filename = `${nameSlug}-photo-${index + 1}.${extensionFor(path)}`;
    return [
      {
        path,
        url: item.signedUrl,
        downloadUrl: `${item.signedUrl}&download=${encodeURIComponent(filename)}`,
        filename,
      },
    ];
  });
}

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
