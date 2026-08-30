"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Supabase's own minimum. Checked client-side for an instant message, but
// the server enforces it regardless — its error is surfaced too.
const MIN_PASSWORD_LENGTH = 6;

// How long to wait for the recovery session to materialise before calling
// the link bad. The client exchanges the ?code= from the email link
// automatically (detectSessionInUrl), so this is really "give the
// round-trip a moment", not a fixed expectation of how long it takes.
const SESSION_WAIT_MS = 5000;

type Status = "verifying" | "ready" | "invalid";

// Supabase reports link failures either in the query string or the hash,
// depending on the flow and where it failed, so both are checked.
function readLinkError(): string | null {
  if (typeof window === "undefined") return null;

  const fromQuery = new URLSearchParams(window.location.search);
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const code = fromQuery.get("error_code") ?? fromHash.get("error_code");
  const description = fromQuery.get("error_description") ?? fromHash.get("error_description");
  const error = fromQuery.get("error") ?? fromHash.get("error");

  if (!code && !description && !error) return null;

  // The most common real failure — worth its own wording rather than
  // Supabase's raw text.
  if (code === "otp_expired") {
    return "This reset link has expired. Request a new one and use it right away.";
  }
  return description ?? "This reset link is invalid or has already been used.";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // An explicit error in the URL is conclusive — no point waiting.
    const urlError = readLinkError();
    if (urlError) {
      setLinkError(urlError);
      setStatus("invalid");
      return;
    }

    let settled = false;

    const markReady = () => {
      if (settled) return;
      settled = true;
      setStatus("ready");
      // Drop the code/token from the address bar so it isn't left in
      // history or copied out of the URL by accident.
      window.history.replaceState({}, "", window.location.pathname);
    };

    const markInvalid = (message: string) => {
      if (settled) return;
      settled = true;
      setLinkError(message);
      setStatus("invalid");
    };

    // Recovery links arrive in one of two shapes, and the client only
    // handles one of them by itself:
    //
    //   ?code=...          PKCE. detectSessionInUrl exchanges this during
    //                      client init, so we just wait for the session.
    //   #access_token=...  Implicit. @supabase/ssr pins the client to
    //                      flowType "pkce", and GoTrueClient throws
    //                      "Not a valid PKCE flow url" for implicit
    //                      callbacks and swallows it — so the client will
    //                      never pick these up, and the page would sit on
    //                      the spinner forever. We establish the session
    //                      ourselves instead.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: sessionError }) => {
          if (sessionError) {
            console.error("Failed to establish recovery session:", sessionError);
            markInvalid(
              "This reset link is invalid or has expired. Request a new one to continue."
            );
          } else {
            markReady();
          }
        });
      return;
    }

    // The PKCE code exchange happens asynchronously on client init, so the
    // session may not exist yet on first render. Listening covers the case
    // where it lands after this effect runs; the getSession() check below
    // covers the case where it already landed before it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const timeout = setTimeout(() => {
      markInvalid(
        // PKCE ties the link to the browser that requested it, so opening
        // it elsewhere genuinely cannot work. Worth naming, rather than
        // leaving the user to guess why a fresh link "doesn't work".
        "This reset link is invalid, has expired, or was opened in a different browser from the one that requested it. Request a new link and open it on this device."
      );
    }, SESSION_WAIT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        // Covers weak-password rejections and "same as old password",
        // both of which Supabase words clearly enough to pass through.
        setError(updateError.message);
        return;
      }

      // Sign the recovery session out so the new password is actually
      // used to get back in — otherwise the user silently stays signed in
      // on a session established by an email link.
      await supabase.auth.signOut();
      router.push("/login?reset=success");
    } catch (err) {
      console.error("Password update failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-naroxe-base px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center">
          <Logo size="lg" className="text-naroxe-ink" />
        </div>

        <div className="mt-8">
        {status === "verifying" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking your reset link…</p>
          </div>
        )}

        {status === "invalid" && (
          <>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              This link doesn&apos;t work
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{linkError}</p>
            <Button
              asChild
              className="mt-6 w-full bg-naroxe-ink text-naroxe-base hover:bg-naroxe-ink/90"
            >
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
            <div className="mt-7 border-t border-naroxe-silver/60 pt-5">
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="font-medium text-foreground hover:underline">
                  Back to log in
                </Link>
              </p>
            </div>
          </>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-base font-semibold tracking-tight text-foreground">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-xs text-muted-foreground">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm" className="text-xs text-muted-foreground">
                  Confirm new password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 bg-naroxe-ink text-naroxe-base hover:bg-naroxe-ink/90"
              >
                {isSubmitting ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}
        </div>
      </div>

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
