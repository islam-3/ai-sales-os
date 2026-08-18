"use client";

import { useState, FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = email.trim().toLowerCase() !== currentEmail.toLowerCase();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingEmail(null);
    setIsSubmitting(true);

    const nextEmail = email.trim();

    try {
      const { error: updateError } = await supabase.auth.updateUser(
        { email: nextEmail },
        // Where the confirmation link lands. This URL has to be on
        // Supabase's redirect allow-list or it falls back to the Site URL.
        { emailRedirectTo: `${window.location.origin}/dashboard/profile` }
      );

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Deliberately not treated as "done": Supabase does not change the
      // address until the link is clicked, and with "Secure email change"
      // enabled it emails BOTH the old and new addresses and needs both
      // confirmed. Saying "saved" here would be a lie the user only
      // discovers on their next login.
      setPendingEmail(nextEmail);
    } catch (err) {
      console.error("Failed to request email change:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionCard
        title="Email address"
        description="Used to sign in and to receive account emails."
        footer={
          <SectionCardFooter
            status={error ? <span className="text-destructive">{error}</span> : null}
          >
            <Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? "Sending…" : "Change email"}
            </Button>
          </SectionCardFooter>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPendingEmail(null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <p className="text-xs text-muted-foreground">
            Currently <span className="text-foreground">{currentEmail}</span>
          </p>
        </div>

        {/* Stays in the card body rather than the footer — it's several
            lines long and needs the room to stay readable. */}
        {pendingEmail && (
          <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Confirm the change in your email</p>
              <p className="mt-1 leading-relaxed text-success/90">
                We&apos;ve sent a confirmation link to{" "}
                <span className="font-medium">{pendingEmail}</span>. Your address stays{" "}
                <span className="font-medium">{currentEmail}</span> until you click it. If your
                project requires confirming from both addresses, check your old inbox too.
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </form>
  );
}
