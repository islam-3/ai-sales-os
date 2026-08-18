"use client";

import { useState, FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";

const MIN_PASSWORD_LENGTH = 6;

export function PasswordForm({ currentEmail }: { currentEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearStatus = () => {
    setSaved(false);
    setError(null);
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // updateUser({ password }) does NOT check the existing password —
      // an open session is enough for it. Re-authenticating first is what
      // actually enforces "you must know your current password", which
      // matters because it stops someone on an unattended logged-in
      // machine from silently taking the account over.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword,
      });

      if (reauthError) {
        setError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        // Covers weak passwords and "must differ from the old password",
        // both of which Supabase words clearly enough to pass through.
        setError(updateError.message);
        return;
      }

      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      console.error("Failed to change password:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionCard
        title="Change password"
        description="You'll need your current password. If you've forgotten it, log out and use the reset link on the login page."
        footer={
          <SectionCardFooter
            status={
              error ? (
                <span className="text-destructive">{error}</span>
              ) : saved ? (
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Password updated
                </span>
              ) : null
            }
          >
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </SectionCardFooter>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password" className="text-xs text-muted-foreground">
            Current password
          </Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              clearStatus();
            }}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password" className="text-xs text-muted-foreground">
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              clearStatus();
            }}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clearStatus();
            }}
            autoComplete="new-password"
            required
          />
        </div>
      </SectionCard>
    </form>
  );
}
