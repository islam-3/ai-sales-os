"use client";

import { useState, useRef, useEffect, FormEvent, ChangeEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSelectedFile(file ?? null);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        body: JSON.stringify({ message: trimmed, photoPath }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
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
        <h1 className="text-lg font-semibold">Dental Clinic Assistant</h1>
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
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
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
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10"
              aria-label="Attach photo"
            >
              📎
            </button>
            <input
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
        </div>
      </form>
    </div>
  );
}
