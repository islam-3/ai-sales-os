"use client";

import { useState, useRef, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import { updateBusinessBranding } from "@/app/dashboard/business/actions";
import { LogoCropDialog } from "@/components/dashboard/business/LogoCropDialog";
import {
  DEFAULT_BRAND_COLOR,
  foregroundFor,
  isValidBrandColor,
  monogram,
  resolveBrandColor,
} from "@/lib/branding";

// Logo and brand colour for the public chat page.
//
// Both fields carry a live preview of the actual chat header and bubble,
// because neither value means much in the abstract — an owner picking a
// colour needs to see it behind white text at the size it will really
// appear, not as a swatch.
export function BrandingForm({
  businessName,
  initialLogoUrl,
  initialBrandColor,
}: {
  businessName: string;
  initialLogoUrl: string | null;
  initialBrandColor: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [file, setFile] = useState<File | null>(null);
  // Object URL for the not-yet-uploaded file, so the preview updates the
  // moment a file is chosen rather than only after saving.
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  // Set while the cropping dialog is open; null when it's closed.
  const [cropSource, setCropSource] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [brandColor, setBrandColor] = useState(initialBrandColor ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty =
    file !== null || removeLogo || (brandColor || null) !== (initialBrandColor ?? null);

  // What the chat page will actually use, including the fallback — so the
  // preview is honest when the field is empty.
  const effectiveColor = resolveBrandColor(brandColor || null);
  const effectiveForeground = foregroundFor(effectiveColor);
  const previewLogo = removeLogo ? null : filePreview ?? logoUrl;

  const colorIsUsable = brandColor === "" || isValidBrandColor(brandColor);

  // Picking a file no longer stages it directly — it opens the cropping
  // step. Only the cropped result becomes the file that gets uploaded, so
  // a non-square logo can never reach Storage and be squashed by the
  // circular frame in the chat header.
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setSaved(false);
    setError(null);

    if (!chosen) return;

    if (!chosen.type.startsWith("image/")) {
      setError("Your logo must be an image file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (cropSource) URL.revokeObjectURL(cropSource.url);
    setCropSource({
      url: URL.createObjectURL(chosen),
      name: chosen.name,
      type: chosen.type,
    });

    // Cleared straight away so choosing the same file twice in a row
    // still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // The cropper hands back a square File; from here it behaves exactly
  // like the raw file used to.
  function handleCropped(cropped: File) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    if (cropSource) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);

    setFile(cropped);
    setFilePreview(URL.createObjectURL(cropped));
    setRemoveLogo(false);
    setSaved(false);
  }

  function handleCropCancel() {
    if (cropSource) URL.revokeObjectURL(cropSource.url);
    setCropSource(null);
  }

  function handleRemove() {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    setRemoveLogo(true);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!colorIsUsable) {
      setError("Brand colour must be a 6-digit hex value, like #1D4ED8.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (file) formData.append("logo", file);
      if (removeLogo) formData.append("removeLogo", "true");
      formData.append("brandColor", brandColor);

      const result = await updateBusinessBranding(formData);

      if (filePreview) URL.revokeObjectURL(filePreview);
      setLogoUrl(result.logoUrl);
      setFile(null);
      setFilePreview(null);
      setRemoveLogo(false);
      setSaved(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your brand settings");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionCard
        title="Brand"
        description="Your logo and colour appear on the chat page your customers see. Both are optional — without them we use your initials and a professional default blue."
        footer={
          <SectionCardFooter
            status={
              error ? (
                <span className="text-destructive">{error}</span>
              ) : saved ? (
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Saved
                </span>
              ) : null
            }
          >
            <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </SectionCardFooter>
        }
      >
        {/* ── Logo ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
              {previewLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewLogo}
                  alt="Your logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="logo-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {previewLogo ? "Replace" : "Upload logo"}
              </Button>
              {previewLogo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleRemove}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A square image works best. PNG with a transparent background looks cleanest.
          </p>
        </div>

        {/* ── Colour ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-color" className="text-xs text-muted-foreground">
            Brand colour
          </Label>
          <div className="flex items-center gap-2">
            {/* The native picker writes a lowercase hex; it's uppercased on
                save so stored values are consistent. */}
            <input
              type="color"
              aria-label="Pick a brand colour"
              value={effectiveColor}
              onChange={(e) => {
                setBrandColor(e.target.value.toUpperCase());
                setSaved(false);
              }}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
            />
            <Input
              id="brand-color"
              value={brandColor}
              onChange={(e) => {
                setBrandColor(e.target.value.toUpperCase());
                setSaved(false);
              }}
              placeholder={DEFAULT_BRAND_COLOR}
              className="font-mono"
            />
            {brandColor && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBrandColor("");
                  setSaved(false);
                }}
              >
                Reset
              </Button>
            )}
          </div>
          {!colorIsUsable && (
            <p className="text-xs text-destructive">
              Use a 6-digit hex value, like {DEFAULT_BRAND_COLOR}.
            </p>
          )}
        </div>

        {/* ── Live preview ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Preview</Label>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2.5 border-b bg-white px-3 py-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold"
                style={
                  previewLogo
                    ? undefined
                    : { backgroundColor: effectiveColor, color: effectiveForeground }
                }
              >
                {previewLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewLogo} alt="" className="h-full w-full object-cover" />
                ) : (
                  monogram(businessName || "Your business")
                )}
              </div>
              <span className="truncate text-sm font-semibold text-neutral-900">
                {businessName || "Your business"}
              </span>
            </div>
            <div className="flex flex-col gap-2 bg-white p-3">
              <div className="max-w-[75%] self-start rounded-2xl rounded-bl-md border border-neutral-200/70 bg-neutral-100 px-3 py-2 text-xs text-neutral-800 shadow-sm">
                Hi! How can we help you today?
              </div>
              <div
                className="max-w-[75%] self-end rounded-2xl rounded-br-md px-3 py-2 text-xs shadow-sm"
                style={{ backgroundColor: effectiveColor, color: effectiveForeground }}
              >
                I&apos;d like to know more about your prices.
              </div>
            </div>
          </div>
          {/* Reassurance that a pale colour won't produce invisible text —
              the foreground flips automatically. */}
          <p className="text-xs text-muted-foreground">
            Text colour is chosen automatically so it stays readable on your colour.
          </p>
        </div>
      </SectionCard>

      <LogoCropDialog
        open={cropSource !== null}
        imageSrc={cropSource?.url ?? null}
        fileName={cropSource?.name ?? "logo"}
        fileType={cropSource?.type ?? "image/png"}
        onCancel={handleCropCancel}
        onCropped={handleCropped}
      />
    </form>
  );
}
