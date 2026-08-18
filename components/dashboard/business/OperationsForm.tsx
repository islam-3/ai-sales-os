"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import type { TenantSettings } from "@/lib/tenant-settings";
import { updateBusinessSettings } from "@/app/dashboard/business/actions";

export function OperationsForm({ initial }: { initial: TenantSettings }) {
  const router = useRouter();
  const initialLanguages = (initial.languages ?? []).join(", ");

  const [openingHours, setOpeningHours] = useState(initial.opening_hours ?? "");
  const [languages, setLanguages] = useState(initialLanguages);
  const [serviceArea, setServiceArea] = useState(initial.service_area ?? "");
  const [currency, setCurrency] = useState(initial.currency ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty =
    openingHours !== (initial.opening_hours ?? "") ||
    languages !== initialLanguages ||
    serviceArea !== (initial.service_area ?? "") ||
    currency !== (initial.currency ?? "");

  function set<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setSaved(false);
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setIsSubmitting(true);

    try {
      await updateBusinessSettings({
        opening_hours: openingHours,
        // Comma-separated in the UI, an array in storage. Blank entries
        // are dropped by the settings parser.
        languages: languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        service_area: serviceArea,
        currency: currency,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save business details");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionCard
        title="Operations"
        description="Practical details the assistant can answer questions about."
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opening-hours" className="text-xs text-muted-foreground">
            Opening hours
          </Label>
          {/* Free text on purpose: real hours include split shifts, seasonal
              changes and "by appointment only", which a per-day grid can't
              express. The assistant just reads this out. */}
          <Textarea
            id="opening-hours"
            value={openingHours}
            onChange={(e) => set(setOpeningHours)(e.target.value)}
            placeholder="e.g. Mon–Fri 09:00–18:00, Sat 10:00–14:00, closed Sundays"
            rows={2}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="languages" className="text-xs text-muted-foreground">
            Languages spoken
          </Label>
          <Input
            id="languages"
            value={languages}
            onChange={(e) => set(setLanguages)(e.target.value)}
            placeholder="e.g. English, Turkish, Arabic"
          />
          <p className="text-xs text-muted-foreground">Separate with commas.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="service-area" className="text-xs text-muted-foreground">
            Service area
          </Label>
          <Input
            id="service-area"
            value={serviceArea}
            onChange={(e) => set(setServiceArea)(e.target.value)}
            placeholder="e.g. Istanbul and surrounding areas; international clients welcome"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency" className="text-xs text-muted-foreground">
            Currency
          </Label>
          <Input
            id="currency"
            value={currency}
            onChange={(e) => set(setCurrency)(e.target.value)}
            placeholder="e.g. USD"
            className="sm:max-w-[12rem]"
          />
          <p className="text-xs text-muted-foreground">
            What prices are quoted in, if you discuss pricing.
          </p>
        </div>
      </SectionCard>
    </form>
  );
}
