"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";

export function PersonalDetailsForm({
  initialFullName,
  initialPhone,
}: {
  initialFullName: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = fullName !== initialFullName || phone !== initialPhone;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setIsSubmitting(true);

    try {
      // Writes to the Auth user's user_metadata. This only ever touches
      // the caller's own record — there's no way to address another
      // user — so no extra authorization check is needed here.
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), phone: phone.trim() },
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSaved(true);
      // Pull the server component's copy back in sync so a reload (or a
      // nav back here) shows the saved values rather than stale props.
      router.refresh();
    } catch (err) {
      console.error("Failed to save personal details:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionCard
        title="Personal details"
        description="Your own name and contact number, separate from your business name."
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
          <Label htmlFor="full-name" className="text-xs text-muted-foreground">
            Full name
          </Label>
          <Input
            id="full-name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. Islam Al Hams"
            autoComplete="name"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone" className="text-xs text-muted-foreground">
            Contact phone
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSaved(false);
            }}
            placeholder="e.g. +90 555 123 4567"
            autoComplete="tel"
          />
        </div>
      </SectionCard>
    </form>
  );
}
