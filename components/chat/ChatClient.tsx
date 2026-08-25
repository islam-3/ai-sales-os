"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { foregroundFor, brandTint, monogram } from "@/lib/branding";

type MessageMedia = { url: string; type: string | null };

type Message = {
  role: "user" | "assistant";
  content: string;
  media?: MessageMedia | null;
  /** Local object URL for a photo the visitor just sent, shown in-bubble. */
  localImage?: string | null;
};

// The public, customer-facing chat.
//
// Styled entirely on its own, deliberately outside the dashboard's design
// token system: this is the product's face to an end customer, and it
// takes its accent from the tenant's brand colour rather than from the
// admin theme. Light-only on purpose — an arbitrary tenant colour
// composited over a dark background is unpredictable, and this page's job
// is to look controlled.
//
// Mobile-first throughout: most visitors arrive from a phone ad link.
export function ChatClient({
  slug,
  businessName,
  logoUrl,
  brandColor,
  subline,
  greeting,
  starterChips,
}: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  brandColor: string;
  subline: string | null;
  greeting: string;
  starterChips: string[];
}) {
  // One session_id per page load — generated fresh on mount, not persisted
  // across reloads, so each visitor/conversation gets its own lead_profile
  // row instead of sharing one.
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Session-scoped on purpose: consent is tied to this conversation, not
  // remembered across visits, so a returning visitor is asked again.
  const [photoConsentGiven, setPhotoConsentGiven] = useState(false);
  const [showPhotoConsent, setShowPhotoConsent] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onBrand = foregroundFor(brandColor);
  // Chips are shown only before the visitor has said anything — once the
  // conversation is underway they'd compete with the real reply.
  const showChips = messages.length === 0 && !isLoading && starterChips.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focuses the text input again every time it re-enables after a send.
  // Deliberately NOT on mount: focusing on load pops the on-screen
  // keyboard the instant a phone visitor arrives, covering the greeting
  // and the starter chips — the two things meant to draw them in.
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isLoading, messages.length]);

  // Object URLs are leaked unless explicitly revoked; this runs on unmount
  // for whatever preview is still outstanding.
  useEffect(() => {
    return () => {
      if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    };
  }, [selectedPreview]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    setSelectedFile(file);
    setSelectedPreview(file ? URL.createObjectURL(file) : null);
  }

  function clearSelectedFile() {
    if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    setSelectedFile(null);
    setSelectedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Photos get an explicit confirmation that plain text messages don't.
  // A photo sent to a clinic, alongside a described symptom, can amount to
  // health data — a special category under GDPR that needs affirmative
  // consent rather than a notice the visitor may never read. Gating the
  // upload rather than the whole conversation puts that step exactly where
  // the sensitive data enters, without a wall in front of every visitor.
  //
  // Asked once per session: repeating it on every attachment would train
  // people to dismiss it without reading.
  function handleAttachClick() {
    if (photoConsentGiven) {
      fileInputRef.current?.click();
      return;
    }
    setShowPhotoConsent(true);
  }

  function acceptPhotoConsent() {
    setPhotoConsentGiven(true);
    setShowPhotoConsent(false);
    // Opened on the next tick so the dialog has closed first — clicking a
    // hidden file input while a dialog is unmounting is unreliable.
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function send(text: string, file: File | null) {
    const trimmed = text.trim();
    if ((!trimmed && !file) || isLoading) return;

    const localImage = file ? URL.createObjectURL(file) : null;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed, localImage },
    ]);
    setInput("");
    clearSelectedFile();
    setIsLoading(true);

    try {
      let photoPath: string | undefined;

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("sessionId", sessionId);
        formData.append("slug", slug);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "Failed to upload photo");
        }
        photoPath = uploadData.path;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          photoPath,
          sessionId,
          slug,
          // The greeting the visitor actually saw. The route stores it as
          // the assistant's opening turn alongside this first message, so
          // the transcript is coherent and the model doesn't greet twice.
          // Sent only on the first message — afterwards it's already in
          // the stored history.
          openingMessage: messages.length === 0 ? greeting : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, media: data.media ?? null },
      ]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input, selectedFile);
  }

  const canSend = !isLoading && (input.trim().length > 0 || selectedFile !== null);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-50">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
            style={logoUrl ? undefined : { backgroundColor: brandColor, color: onBrand }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${businessName} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              monogram(businessName)
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight text-neutral-900">
              {businessName}
            </h1>
            {subline && (
              <p className="truncate text-xs leading-tight text-neutral-500">{subline}</p>
            )}
          </div>

          {/* A quiet online cue: this is a live conversation, not a form. */}
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-neutral-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Online
          </span>
        </div>
      </header>

      {/* ── Messages ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-5">
          {/* The proactive opening. Rendered as a real assistant bubble so
              the visitor arrives to a conversation already in progress
              rather than an empty box asking them to start. */}
          <Bubble role="assistant" brandColor={brandColor} onBrand={onBrand}>
            {greeting}
          </Bubble>

          {messages.map((msg, i) => (
            <Bubble key={i} role={msg.role} brandColor={brandColor} onBrand={onBrand}>
              {msg.content && <span className="whitespace-pre-wrap">{msg.content}</span>}

              {msg.localImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.localImage}
                  alt="Photo you shared"
                  onClick={() => setLightboxUrl(msg.localImage!)}
                  className={`max-h-56 w-full cursor-zoom-in rounded-xl object-cover ${
                    msg.content ? "mt-2" : ""
                  }`}
                />
              )}

              {msg.media?.type === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.media.url}
                  alt={`Shared by ${businessName}`}
                  onClick={() => setLightboxUrl(msg.media!.url)}
                  className="mt-2 max-h-64 w-full cursor-zoom-in rounded-xl object-cover"
                />
              )}

              {msg.media?.type === "video" && (
                <video
                  src={msg.media.url}
                  controls
                  playsInline
                  className="mt-2 max-h-64 w-full rounded-xl bg-black"
                />
              )}
            </Bubble>
          ))}

          {isLoading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Composer ────────────────────────────────────────────────── */}
      <div
        className="sticky bottom-0 z-20 border-t border-neutral-200/80 bg-white/95 backdrop-blur-md"
        // Keeps the input clear of the iPhone home indicator. Without
        // this the send button sits underneath it and is hard to tap.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-3">
          {/* Starter chips, above the input so a tap is within thumb
              reach on a phone. */}
          {showChips && (
            <div className="mb-3 flex flex-wrap gap-2">
              {starterChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void send(chip, null)}
                  className="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    borderColor: brandTint(brandColor, 0.25),
                    backgroundColor: brandTint(brandColor, 0.06),
                    color: brandColor,
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {selectedPreview && (
            <div className="mb-2 flex w-fit items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 pr-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPreview}
                alt="Selected"
                className="h-10 w-10 rounded-lg object-cover"
              />
              <span className="max-w-[140px] truncate text-xs text-neutral-600">
                {selectedFile?.name}
              </span>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                aria-label="Remove attached photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isLoading}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleAttachClick}
              disabled={isLoading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40"
              aria-label="Attach a photo"
            >
              <ImagePlus className="h-5 w-5" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              disabled={isLoading}
              // 16px minimum: anything smaller makes iOS Safari zoom the
              // whole page in when the field is focused.
              className="h-11 min-w-0 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-[16px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!canSend}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
              style={{ backgroundColor: brandColor, color: onBrand }}
              aria-label="Send message"
            >
              <Send className="h-[18px] w-[18px]" />
            </button>
          </form>

          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-neutral-400">
            Your messages are shared with {businessName} to handle your enquiry.{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-neutral-600">
              Privacy
            </a>
            {" · "}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-neutral-600">
              Terms
            </a>
          </p>
        </div>
      </div>

      {/* ── Photo consent ───────────────────────────────────────────── */}
      {showPhotoConsent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-consent-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="photo-consent-title" className="text-base font-semibold text-neutral-900">
              Before you share a photo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Your photo will be stored and shared with {businessName} so their team can assess
              your enquiry. Depending on what it shows, a photo may reveal health-related
              information about you.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              You can continue the conversation without sharing one. See our{" "}
              <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Privacy Policy
              </a>{" "}
              for how photos are stored and how to request deletion.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowPhotoConsent(false)}
                className="rounded-full border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptPhotoConsent}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ backgroundColor: brandColor, color: onBrand }}
              >
                I understand — choose photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image lightbox ──────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close image"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Asymmetric corner radius is what makes the two sides read differently
// at a glance on a small screen — the flattened corner points at whoever
// is speaking.
function Bubble({
  role,
  brandColor,
  onBrand,
  children,
}: {
  role: "user" | "assistant";
  brandColor: string;
  onBrand: string;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm sm:max-w-[75%] ${
          isUser
            ? "rounded-br-md"
            : "rounded-bl-md border border-neutral-200/70 bg-white text-neutral-800"
        }`}
        style={isUser ? { backgroundColor: brandColor, color: onBrand } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// Three dots with staggered delays, in an assistant-shaped bubble so the
// reply appears to land exactly where the indicator was.
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-neutral-200/70 bg-white px-4 py-3.5 shadow-sm">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400"
            style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
    </div>
  );
}
