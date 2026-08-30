"use client";

import { Suspense, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The front door to the product, so it carries the Naroxe identity rather
// than presenting a bare form. Restrained on purpose: navy is the only
// colour with any weight, silver appears exactly once as a hairline, and
// everything else is surface, type and space.

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "success";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
      {/* Identity block. Centred and given real space beneath it — the
          brand is the first thing read, then the task. */}
      <div className="flex flex-col items-center text-center">
        <Logo size="lg" className="text-naroxe-ink" />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Turn curious visitors into ready buyers.
        </p>
      </div>

      <div className="mt-8">
        <h1 className="text-base font-semibold tracking-tight text-foreground">Log in</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Welcome back.</p>
      </div>

      {justReset && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Your password has been updated. Log in with your new password.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
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
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password" className="text-xs text-muted-foreground">
              Password
            </Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Navy rather than the default ink button: on the one page that
            carries the brand, the primary action should be the brand
            colour. In dark mode the token inverts to near-white, which is
            what the rest of the dark theme's solid buttons already do. */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 bg-naroxe-ink text-naroxe-base hover:bg-naroxe-ink/90"
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {/* The single use of silver: a hairline that separates the form from
          the way out of it, without adding another border colour. */}
      <div className="mt-7 border-t border-naroxe-silver/60 pt-5">
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-naroxe-base px-4 py-10">
      {/* useSearchParams() needs a Suspense boundary in the App Router,
          otherwise the whole route opts out of static rendering and
          `next build` warns about it. The fallback matches the card's
          footprint so the page doesn't jump when the form arrives. */}
      <Suspense
        fallback={<div className="h-[30rem] w-full max-w-sm rounded-2xl border bg-card shadow-sm" />}
      >
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-foreground hover:underline">
          Terms
        </Link>
      </p>
    </div>
  );
}
