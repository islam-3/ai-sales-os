"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent, CSSProperties } from "react";
import type { ChatPalette, ChatTheme } from "@/lib/branding";
import { splitStoredGreeting } from "@/lib/chat-intro";
import { readStoredSession, writeStoredSession } from "@/lib/resume";

type Message = {
  role: "user" | "assistant";
  content: string;
  /** Local object URL for a photo the visitor just sent, shown in-bubble. */
  localImage?: string | null;
  /** When it appeared in this session. Real, unlike a read receipt. */
  at: Date;
};

// The public, customer-facing chat.
//
// Styled entirely by chat.css, scoped under .nx-chat and deliberately
// outside the dashboard's design token system: this is the product's face
// to an end customer, and it takes its accent and its light/dark choice
// from the tenant rather than from the admin theme or the visitor's OS.
//
// Naroxe does not appear anywhere on this page. Every avatar is the
// business — its logo when it has one, its initials when it doesn't.
//
// Mobile-first throughout: most visitors arrive from a phone ad link.
export function ChatClient({
  slug,
  businessName,
  logoUrl,
  monogram,
  theme,
  palette,
  fontClassName,
  subline,
  greeting,
  greetingTitle,
  greetingSub,
  direction,
  starterChips,
}: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  monogram: string;
  theme: ChatTheme;
  palette: ChatPalette;
  fontClassName: string;
  subline: string | null;
  /** The full opening line, posted back with the first message. */
  greeting: string;
  greetingTitle: string;
  greetingSub: string;
  /** Layout direction, from the language the tenant greets visitors in. */
  direction: "ltr" | "rtl";
  starterChips: string[];
}) {
  // One session_id per CONVERSATION, not per page load.
  //
  // It used to be per load, which meant a refresh threw the conversation
  // away and started another. Two real losses: most visitors will not
  // retype it, so the lead is gone; and the ones who do create a second
  // lead_profile row, so the team calls the same person twice.
  //
  // Reusing the id is what fixes both, and neither needed new code to be
  // safe. record_conversation_start is idempotent per (tenant, session)
  // so a resumed conversation is not billed again, and lead_profile is
  // written through one upsert on the same key so it is updated rather
  // than duplicated.
  //
  // Generated during render rather than in an effect so the very first
  // message cannot race it. The stored value is adopted in the effect
  // below, which is also where the transcript comes back.
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  // The greeting as the visitor ACTUALLY SAW IT, read back from the
  // transcript. Never the server's current one: those differ whenever
  // the owner has edited their intro or had a new translation approved,
  // and a visitor returning to a visibly different clinic is the worst
  // version of this feature.
  const [restoredGreeting, setRestoredGreeting] = useState<string | null>(null);
  // True until resume has been attempted. Sending is blocked meanwhile,
  // so a fast typist cannot post a first message that races the restore
  // and ends up with the transcript appended underneath it.
  const [restoring, setRestoring] = useState(true);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Session-scoped on purpose: consent is tied to this conversation, not
  // remembered across visits, so a returning visitor is asked again.
  const [photoConsentGiven, setPhotoConsentGiven] = useState(false);
  const [showPhotoConsent, setShowPhotoConsent] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chips are shown only before the visitor has said anything — once the
  // conversation is underway they'd compete with the real reply. A
  // resumed conversation is underway by definition, and they stay hidden
  // while the restore is in flight so they cannot flash up and be tapped
  // a moment before the transcript lands on top of them.
  const showChips =
    messages.length === 0 &&
    !isLoading &&
    !restoring &&
    restoredGreeting === null &&
    starterChips.length > 0;

  // What the greeting block says. A resumed conversation shows the
  // greeting from its own transcript, split the same way buildChatIntro
  // split it — same design, the visitor's own words. Everyone else gets
  // the server's, as before.
  const shown = restoredGreeting
    ? splitStoredGreeting(restoredGreeting, greetingTitle)
    : { title: greetingTitle, sub: greetingSub };

  // Adopts a stored session and brings its transcript back.
  //
  // Runs once. A stored id older than the window is ignored here and
  // would be refused by the endpoint anyway — the client copy of the
  // window only avoids a pointless request, because localStorage is the
  // visitor's to edit and cannot be the authority on anything.
  //
  // Every failure path ends the same way: keep the freshly generated id
  // and start a normal conversation. A visitor who cannot resume has
  // lost nothing they had a minute ago; a chat page that will not open
  // has lost the lead.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = readStoredSession(slug);
      if (!stored) {
        writeStoredSession(slug, { id: sessionId, startedAt: Date.now() });
        setRestoring(false);
        return;
      }

      try {
        const res = await fetch("/api/chat/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, sessionId: stored.id }),
        });
        const data = await res.json();
        if (cancelled) return;

        const restored: { role: string; content: string; at?: string }[] = res.ok
          ? data.messages ?? []
          : [];

        if (restored.length === 0) {
          // Expired, empty, or refused. A new conversation, and the new
          // id replaces the old one so the next refresh resumes THIS one.
          writeStoredSession(slug, { id: sessionId, startedAt: Date.now() });
          setRestoring(false);
          return;
        }

        setSessionId(stored.id);

        // The first stored turn is the greeting the route saved when this
        // conversation began. It is lifted out of the thread and shown in
        // the greeting block, exactly where the visitor saw it — rather
        // than appearing as an ordinary bubble, which would make a
        // resumed page look different from the one they left.
        const [first, ...rest] = restored;
        const opensWithGreeting = first.role === "assistant";
        if (opensWithGreeting) setRestoredGreeting(first.content);

        setMessages(
          (opensWithGreeting ? rest : restored).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            at: m.at ? new Date(m.at) : new Date(),
          }))
        );
      } catch {
        if (!cancelled) writeStoredSession(slug, { id: sessionId, startedAt: Date.now() });
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Once per mount, on purpose: sessionId is set inside this effect and
    // listing it would re-run the restore against the id it just adopted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focuses the text input again every time it re-enables after a send.
  // Deliberately NOT on mount: focusing on load pops the on-screen
  // keyboard the instant a phone visitor arrives, covering the greeting
  // and the starter chips — the two things meant to draw them in.
  //
  // A RESTORED conversation arrives with messages already in it, which
  // looked to this effect exactly like a send that had just finished —
  // so resuming on a phone popped the keyboard over the transcript the
  // visitor came back to read. hasSent is what tells the two apart: it
  // is true only after this visitor has actually typed something in this
  // page load.
  const hasSent = useRef(false);
  useEffect(() => {
    if (!isLoading && hasSent.current) {
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
    // `restoring` is in here, not only on the button: a chip tap or an
    // Enter key would otherwise post a first message under the old
    // session id and have the restored transcript arrive underneath it.
    if ((!trimmed && !file) || isLoading || restoring) return;

    hasSent.current = true;
    const localImage = file ? URL.createObjectURL(file) : null;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed, localImage, at: new Date() },
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
          // the stored history. Must remain the FULL greeting string, not
          // the title/sub split used for display.
          //
          // restoredGreeting is checked as well as the message count. A
          // resumed conversation whose transcript held nothing but the
          // greeting would otherwise look empty here and post a SECOND
          // greeting into the stored history.
          openingMessage:
            messages.length === 0 && restoredGreeting === null ? greeting : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, at: new Date() },
      ]);
    } catch (err) {
      console.error("Chat request failed:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          at: new Date(),
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

  const canSend = !isLoading && !restoring && (input.trim().length > 0 || selectedFile !== null);

  return (
    <div
      className={`nx-chat ${fontClassName}`}
      data-theme={theme}
      // Layout direction only. Which side a speaker's bubble sits on is
      // a property of the tenant's language, not of whatever a single
      // visitor happens to type, so it stays put for the conversation.
      dir={direction}
      // The tenant's accent and its derived shadows. Everything else is
      // in chat.css; only what varies per business is inlined.
      style={palette as CSSProperties}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="nx-header">
        <div className="nx-header__inner">
          <BusinessAvatar
          className="nx-avatar"
          logoUrl={logoUrl}
          monogram={monogram}
          businessName={businessName}
        />

          <div className="nx-id">
            <div className="nx-name">{businessName}</div>
            <div className="nx-status">
              <span className="nx-dot-online" aria-hidden />
              <span>{subline ? `Online · ${subline}` : "Online · replies instantly"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Thread ────────────────────────────────────────────────── */}
      <div className="nx-thread">
        <div className="nx-thread__inner">
        {/* The proactive opening. Rendered as a greeting block rather than
            a bubble so the page looks composed when it is otherwise empty
            — which is how most visitors will first see it. */}
        <section className="nx-greeting">
          <BusinessAvatar
            className="nx-greeting__mark"
            logoUrl={logoUrl}
            monogram={monogram}
            businessName={businessName}
          />
          {shown.title && (
            <h1 className="nx-greeting__title" dir="auto">
              {shown.title}
            </h1>
          )}
          {shown.sub && (
            <p className="nx-greeting__sub" dir="auto">
              {shown.sub}
            </p>
          )}
        </section>

        {showChips && (
          <div className="nx-chips">
            {starterChips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="nx-chip"
                onClick={() => void send(chip, null)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <article key={i} className={`nx-msg ${isUser ? "nx-msg--user" : "nx-msg--bot"}`}>
              <div className="nx-msg__row">
                {!isUser && (
                  <BusinessAvatar
                    className="nx-msg__avatar"
                    logoUrl={logoUrl}
                    monogram={monogram}
                    businessName={businessName}
                  />
                )}

                <div className="nx-msg__stack">
                  {msg.localImage && (
                    <button
                      type="button"
                      className="nx-bubble nx-bubble--image"
                      onClick={() => setLightboxUrl(msg.localImage!)}
                      aria-label="Open image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={msg.localImage} alt="Photo you shared" />
                    </button>
                  )}

                  {msg.content && (
                    <div className="nx-bubble">
                      {/* Per message, not per layout: the visitor may write
                          Arabic to an English clinic and both must read
                          correctly in the same thread. */}
                      <span className="nx-bubble__text" dir="auto">
                        {msg.content}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="nx-msg__meta">
                <time dateTime={msg.at.toISOString()}>{formatTime(msg.at)}</time>
              </div>
            </article>
          );
        })}

        {isLoading && (
          <div className="nx-typing" role="status" aria-label={`${businessName} is typing`}>
            <BusinessAvatar
              className="nx-msg__avatar"
              logoUrl={logoUrl}
              monogram={monogram}
              businessName={businessName}
            />
            <div className="nx-typing__bubble">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
        </div>
      </div>

      {/* ── Composer ──────────────────────────────────────────────── */}
      <form className="nx-composer" onSubmit={handleSubmit}>
        <div className="nx-composer__inner">
        {selectedPreview && (
          <div className="nx-filechip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedPreview} alt="" />
            <span className="nx-filechip__name">{selectedFile?.name}</span>
            <button type="button" onClick={clearSelectedFile} aria-label="Remove attached photo">
              <CloseIcon />
            </button>
          </div>
        )}

        <div className="nx-composer__row">
          <div className="nx-field">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isLoading}
              hidden
            />
            <button
              type="button"
              className="nx-attach"
              onClick={handleAttachClick}
              disabled={isLoading}
              aria-label="Attach a photo"
            >
              <CameraIcon />
            </button>

            <input
              ref={inputRef}
              className="nx-input"
              dir="auto"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${businessName}…`}
              aria-label="Message"
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="nx-send" disabled={!canSend} aria-label="Send">
            <SendIcon />
          </button>
        </div>

        <p className="nx-legal">
          Your messages are shared with {businessName} ·{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="/terms" target="_blank" rel="noreferrer">
            Terms
          </a>
        </p>
        </div>
      </form>

      {/* ── Photo consent ─────────────────────────────────────────── */}
      {showPhotoConsent && (
        <div
          className="nx-scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nx-consent-title"
        >
          <div className="nx-dialog">
            <h2 id="nx-consent-title">Before you share a photo</h2>
            <p>
              Your photo will be stored and shared with {businessName} so their team can assess
              your enquiry. Depending on what it shows, a photo may reveal health-related
              information about you.
            </p>
            <p>
              You can continue the conversation without sharing one. See our{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>{" "}
              for how photos are stored and how to request deletion.
            </p>
            <div className="nx-dialog__actions">
              <button
                type="button"
                className="nx-btn nx-btn--ghost"
                onClick={() => setShowPhotoConsent(false)}
              >
                Cancel
              </button>
              <button type="button" className="nx-btn nx-btn--brand" onClick={acceptPhotoConsent}>
                I understand — choose photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="nx-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full size image"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Full size" />
          <button
            type="button"
            className="nx-lightbox__close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close image"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// The business's own identity, at whatever size the caller's class sets.
// Falls back to initials so a tenant without a logo still gets a composed
// tile rather than an empty box.
function BusinessAvatar({
  className,
  logoUrl,
  monogram,
  businessName,
}: {
  className: string;
  logoUrl: string | null;
  monogram: string;
  businessName: string;
}) {
  return (
    <div className={className} aria-hidden={!logoUrl || undefined}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`${businessName} logo`} />
      ) : (
        monogram
      )}
    </div>
  );
}

// Locale-aware, hour and minute only — the meridiem is dropped because a
// timestamp beside a bubble should be glanceable, not precise.
function formatTime(date: Date): string {
  return date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M/i, "");
}

function CameraIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2.2" y="4.6" width="15.6" height="11.4" rx="2.8" />
      <circle cx="10" cy="10.3" r="3" />
      <path d="M7.4 4.6l1-1.6h3.2l1 1.6" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 16.5V4M4.6 9.4L10 4l5.4 5.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 3.5l9 9M12.5 3.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
