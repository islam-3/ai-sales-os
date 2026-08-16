"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createTenantForNewUser, previewSlug } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Mirrors slugify() in ./actions.ts — used only as a last-resort local
// fallback if the live availability check fails, so the preview never
// gets stuck on "Checking…" forever. The real, authoritative slug is
// always decided server-side at signup time either way.
function slugifyForDisplay(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "clinic";
}

const SLUG_CHECK_DEBOUNCE_MS = 500;

export default function SignupPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [origin, setOrigin] = useState("");
  const [slugPreview, setSlugPreview] = useState<string | null>(null);
  const [slugCheckFailed, setSlugCheckFailed] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Debounced live preview of the actual chat link slug, checked against
  // real existing tenants — so a name that collides with one (like "Demo
  // Clinic" already existing) visibly shows the -2 suffix before signup,
  // instead of surprising the owner afterward.
  useEffect(() => {
    const trimmed = businessName.trim();
    if (!trimmed) {
      setSlugPreview(null);
      setSlugCheckFailed(false);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const slug = await previewSlug(trimmed);
        if (!cancelled) {
          setSlugPreview(slug);
          setSlugCheckFailed(false);
        }
      } catch (err) {
        console.error("Slug preview failed:", err);
        if (!cancelled) {
          setSlugPreview(slugifyForDisplay(trimmed));
          setSlugCheckFailed(true);
        }
      }
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [businessName]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("Signup didn't return a user. Please try again.");
        return;
      }

      await createTenantForNewUser(userId, businessName);

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up your clinic to start using the dashboard.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-name" className="text-xs text-muted-foreground">
              Business name
            </Label>
            <Input
              id="business-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Demo Dental Clinic"
              required
            />
            {businessName.trim() && (
              <p className="text-xs text-muted-foreground">
                {slugPreview ? (
                  <>
                    Your chat link will be:{" "}
                    <span className="font-medium text-foreground">
                      {origin}/chat/{slugPreview}
                    </span>
                    {slugCheckFailed && " (availability not confirmed — checked again at signup)"}
                  </>
                ) : (
                  "Checking chat link availability…"
                )}
              </p>
            )}
          </div>

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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-xs text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
