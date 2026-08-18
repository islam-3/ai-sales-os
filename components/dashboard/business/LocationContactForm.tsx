"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import type { TenantSettings } from "@/lib/tenant-settings";
import { updateBusinessSettings } from "@/app/dashboard/business/actions";

export function LocationContactForm({ initial }: { initial: TenantSettings }) {
  const router = useRouter();
  const [address, setAddress] = useState(initial.location?.address ?? "");
  const [city, setCity] = useState(initial.location?.city ?? "");
  const [country, setCountry] = useState(initial.location?.country ?? "");
  const [phone, setPhone] = useState(initial.contact?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial.contact?.whatsapp ?? "");
  const [email, setEmail] = useState(initial.contact?.email ?? "");
  const [website, setWebsite] = useState(initial.contact?.website ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty =
    address !== (initial.location?.address ?? "") ||
    city !== (initial.location?.city ?? "") ||
    country !== (initial.location?.country ?? "") ||
    phone !== (initial.contact?.phone ?? "") ||
    whatsapp !== (initial.contact?.whatsapp ?? "") ||
    email !== (initial.contact?.email ?? "") ||
    website !== (initial.contact?.website ?? "");

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
      // Only this card's keys are sent; the action merges them over the
      // stored object so the Operations card's fields survive untouched.
      await updateBusinessSettings({
        location: { address, city, country },
        contact: { phone, whatsapp, email, website },
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
        title="Location & contact"
        description="Where you are and how people reach you. The assistant can share these when asked."
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
          <Label htmlFor="address" className="text-xs text-muted-foreground">
            Address
          </Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => set(setAddress)(e.target.value)}
            placeholder="e.g. 42 Bahçelievler Cad."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city" className="text-xs text-muted-foreground">
              City
            </Label>
            <Input
              id="city"
              value={city}
              onChange={(e) => set(setCity)(e.target.value)}
              placeholder="e.g. Istanbul"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country" className="text-xs text-muted-foreground">
              Country
            </Label>
            <Input
              id="country"
              value={country}
              onChange={(e) => set(setCountry)(e.target.value)}
              placeholder="e.g. Türkiye"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="biz-phone" className="text-xs text-muted-foreground">
              Phone
            </Label>
            <Input
              id="biz-phone"
              type="tel"
              value={phone}
              onChange={(e) => set(setPhone)(e.target.value)}
              placeholder="e.g. +90 212 000 0000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="biz-whatsapp" className="text-xs text-muted-foreground">
              WhatsApp
            </Label>
            <Input
              id="biz-whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => set(setWhatsapp)(e.target.value)}
              placeholder="e.g. +90 555 000 0000"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="biz-email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <Input
              id="biz-email"
              type="email"
              value={email}
              onChange={(e) => set(setEmail)(e.target.value)}
              placeholder="e.g. hello@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="biz-website" className="text-xs text-muted-foreground">
              Website
            </Label>
            <Input
              id="biz-website"
              value={website}
              onChange={(e) => set(setWebsite)(e.target.value)}
              placeholder="e.g. example.com"
            />
          </div>
        </div>
      </SectionCard>
    </form>
  );
}
