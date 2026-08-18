"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import { INDUSTRY_SUGGESTIONS } from "@/lib/tenant-settings";
import { updateBusinessIdentity } from "@/app/dashboard/business/actions";

export function BusinessIdentityForm({
  initialBusinessName,
  initialIndustry,
  initialDescription,
}: {
  initialBusinessName: string;
  initialIndustry: string;
  initialDescription: string;
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [industry, setIndustry] = useState(initialIndustry);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty =
    businessName !== initialBusinessName ||
    industry !== initialIndustry ||
    description !== initialDescription;

  function touch<T>(setter: (v: T) => void) {
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
      await updateBusinessIdentity({ businessName, industry, description });
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
        title="Business identity"
        description="Who you are. The assistant uses this to introduce itself correctly and to adopt the right tone for your industry."
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
          <Label htmlFor="business-name" className="text-xs text-muted-foreground">
            Business name
          </Label>
          <Input
            id="business-name"
            value={businessName}
            onChange={(e) => touch(setBusinessName)(e.target.value)}
            placeholder="e.g. Northside Dental"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="industry" className="text-xs text-muted-foreground">
            Industry
          </Label>
          {/* Free text with suggestions — the assistant adapts to whatever
              is typed here, so an unlisted business type still works. */}
          <Input
            id="industry"
            list="industry-suggestions"
            value={industry}
            onChange={(e) => touch(setIndustry)(e.target.value)}
            placeholder="e.g. Dental clinic"
          />
          <datalist id="industry-suggestions">
            {INDUSTRY_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">
            Drives the assistant&apos;s persona and vocabulary — for example whether it says
            &quot;patient&quot;, &quot;client&quot;, or &quot;customer&quot;.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            About the business
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => touch(setDescription)(e.target.value)}
            placeholder="A short summary of what you do, who you serve, and what makes you different."
            rows={4}
          />
        </div>
      </SectionCard>
    </form>
  );
}
