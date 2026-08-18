"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // redirectTo must be an absolute URL and must be on Supabase's
      // allow-list (Auth > URL Configuration), or Supabase silently falls
      // back to the Site URL and the user lands somewhere unexpected.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        console.error("Password reset request failed:", resetError);

        // Rate limiting is the one error worth showing. It says nothing
        // about whether the account exists (it's throttled per IP, not
        // per address), and staying silent here would be actively
        // misleading — the user would be told to check an inbox that
        // never receives anything.
        if (resetError.status === 429) {
          setError(
            resetError.message ||
              "Too many requests just now. Wait a minute and try again."
          );
          return;
        }

        // Every other failure is deliberately swallowed: reporting "no
        // such account" would turn this form into an account-existence
        // oracle. A valid request for an unknown address also succeeds
        // silently by design, so both paths land on the same
        // confirmation below.
      }

      setSent(true);
    } catch (err) {
      console.error("Password reset request threw:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        {sent ? (
          <>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
              <MailCheck className="h-5 w-5 text-success" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>,
              we&apos;ve sent a link to reset your password. The link expires after a short while.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Didn&apos;t get it? Check your spam folder, or{" "}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-medium text-foreground underline hover:no-underline"
              >
                try a different address
              </button>
              .
            </p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/login">Back to log in</Link>
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Reset your password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={isSubmitting} className="mt-2">
                {isSubmitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="font-medium text-foreground hover:underline">
                Log in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
