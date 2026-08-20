"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";

type MessageMedia = { url: string; type: string | null };

type Message = {
  role: "user" | "assistant";
  content: string;
  media?: MessageMedia | null;
};

export function ChatClient({ slug, businessName }: { slug: string; businessName: string }) {
  // One session_id per page load — generated fresh on mount, not persisted
  // across reloads, so each visitor/conversation gets its own lead_profile
  // row instead of sharing one.
  const [sessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Session-scoped on purpose: consent is tied to this conversation, not
  // remembered across visits, so a returning visitor is asked again.
  const [photoConsentGiven, setPhotoConsentGiven] = useState(false);
  const [showPhotoConsent, setShowPhotoConsent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focuses the text input on mount, and again every time it re-enables
  // after a send completes, so the user can keep typing without clicking
  // back into the box.
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSelectedFile(file ?? null);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
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

  async function handleSend(e: FormEvent) {
    e.preventDefault();

    const trimmed = input.trim();
    const file = selectedFile;
    if ((!trimmed && !file) || isLoading) return;

    const displayContent = file
      ? [trimmed, `📎 ${file.name}`].filter(Boolean).join("\n")
      : trimmed;

    setMessages((prev) => [...prev, { role: "user", content: displayContent }]);
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

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "Failed to upload photo");
        }

        photoPath = uploadData.path;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, photoPath, sessionId, slug }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, media: data.media ?? null },
      ]);
    } catch (err) {
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

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-black">
      <header className="border-b border-black/10 p-4 dark:border-white/10">
        <h1 className="text-lg font-semibold">{businessName}</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-black/40 dark:text-white/40">
              Ask a question to get started.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-black/5 text-black dark:bg-white/10 dark:text-white"
                }`}
              >
                {msg.content}
              </div>

              {/* Simple attachment rendering — not fully polished, just
                  enough to actually show the media a reply references. */}
              {msg.media && msg.media.type === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.media.url}
                  alt="Shared by the clinic"
                  className="mt-1.5 max-w-[240px] rounded-lg border border-black/10 dark:border-white/10"
                />
              )}
              {msg.media && msg.media.type === "video" && (
                <a
                  href={msg.media.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-xs text-black/70 hover:text-black dark:border-white/10 dark:text-white/70 dark:hover:text-white"
                >
                  🎥 View video
                </a>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-black/5 px-4 py-2 text-sm text-black/50 dark:bg-white/10 dark:text-white/50">
                Thinking…
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-black/10 p-4 dark:border-white/10"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {selectedFile && (
            <div className="flex w-fit items-center gap-2 rounded-lg bg-black/5 px-3 py-1.5 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
              <span>📎 {selectedFile.name}</span>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
                aria-label="Remove attached photo"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex gap-2">
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
              className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10"
              aria-label="Attach photo"
            >
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-blue-600 disabled:opacity-50 dark:border-white/10"
            />
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>

          {/* Standing notice rather than a blocking modal: the visitor
              chose to message this business, so that their message reaches
              it is proportionate to state plainly and keep visible. */}
          <p className="text-center text-xs leading-relaxed text-black/50 dark:text-white/50">
            Messages and photos you share are collected and sent to {businessName} to handle your
            enquiry.{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-black/80 dark:hover:text-white/80"
            >
              Privacy Policy
            </a>
            {" · "}
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-black/80 dark:hover:text-white/80"
            >
              Terms
            </a>
          </p>
        </div>
      </form>

      {showPhotoConsent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-consent-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 shadow-lg dark:border-white/10 dark:bg-neutral-900">
            <h2
              id="photo-consent-title"
              className="text-base font-semibold text-black dark:text-white"
            >
              Before you share a photo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-black/70 dark:text-white/70">
              Your photo will be stored and shared with {businessName} so their team can assess
              your enquiry. Depending on what it shows, a photo may reveal health-related
              information about you.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-black/70 dark:text-white/70">
              You can continue the conversation without sharing one. See our{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Privacy Policy
              </a>{" "}
              for how photos are stored and how to request deletion.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPhotoConsent(false)}
                className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptPhotoConsent}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
              >
                I understand — choose photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
