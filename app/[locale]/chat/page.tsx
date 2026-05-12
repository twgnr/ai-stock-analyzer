"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Send, RefreshCw, Sparkles, Trash2, AlertCircle } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  provider?: string;
  createdAt: number;
}

const STORAGE_KEY = "ai-stock-analyzer:chat:v1";

const SUGGESTION_KEYS = [
  "riskiest",
  "chinaExposure",
  "last30Days",
  "topConcerns",
  "techWeighted",
  "reduce",
] as const;

export default function ChatPage() {
  const t = useTranslations("Chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const stamp = Date.now();
    const newMsg: ChatMessage = {
      role: "user",
      content: text.trim(),
      createdAt: stamp,
    };
    const history = [...messages, newMsg];
    // Assistant-Platzhalter sofort einfügen, in den die Stream-Deltas
    // hineingeschrieben werden. So sieht der User direkt eine Bubble.
    const placeholder: ChatMessage = {
      role: "assistant",
      content: "",
      createdAt: stamp + 1,
    };
    setMessages([...history, placeholder]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error(t("noStreamBody"));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const ctrl = { buffer: "", meta: {} as { model?: string; provider?: string } };

      function appendDelta(delta: string) {
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx]?.role === "assistant") {
            next[lastIdx] = {
              ...next[lastIdx],
              content: next[lastIdx].content + delta,
            };
          }
          return next;
        });
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        ctrl.buffer += decoder.decode(value, { stream: true });
        // SSE-Frames sind durch Doppel-Newlines getrennt.
        let idx;
        while ((idx = ctrl.buffer.indexOf("\n\n")) >= 0) {
          const frame = ctrl.buffer.slice(0, idx);
          ctrl.buffer = ctrl.buffer.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            try {
              const data = JSON.parse(payload);
              if (data.error) throw new Error(data.error);
              if (typeof data.delta === "string") appendDelta(data.delta);
              if (data.meta) ctrl.meta = data.meta;
            } catch (e) {
              if (e instanceof Error) throw e;
              // sonst: ignorierbarer Parse-Fehler eines Teil-Frames
            }
          }
        }
      }

      // Finale Meta in die letzte Nachricht schreiben.
      const finalMeta = ctrl.meta;
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (next[lastIdx]?.role === "assistant") {
          next[lastIdx] = {
            ...next[lastIdx],
            model: finalMeta.model,
            provider: finalMeta.provider,
          };
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      // Platzhalter wieder entfernen, damit kein leerer Bubble bleibt.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    if (messages.length > 0 && !confirm(t("confirmClear"))) return;
    setMessages([]);
    setError(null);
    fetch("/api/chat", { method: "DELETE" }).catch(() => {});
  }

  async function refreshContext() {
    await fetch("/api/chat", { method: "DELETE" });
    setError(null);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageCircle size={22} className="text-[var(--accent)]" />
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--muted)]">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshContext}
            className="btn text-sm"
            title={t("refreshContextTitle")}
          >
            <RefreshCw size={14} />
            {t("refreshContext")}
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="btn btn-danger text-sm">
              <Trash2 size={14} /> {t("clear")}
            </button>
          )}
        </div>
      </div>

      <div className="card flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <MessageCircle size={40} className="text-[var(--muted)] opacity-40" />
              <div>
                <div className="font-semibold mb-1">{t("emptyTitle")}</div>
                <div className="text-sm text-[var(--muted)]">{t("emptyBody")}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
                {SUGGESTION_KEYS.map((key) => {
                  const s = t(`suggestions.${key}`);
                  return (
                    <button
                      key={key}
                      onClick={() => send(s)}
                      className="text-left text-sm px-3 py-2 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors"
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            const isLastAssistant =
              msg.role === "assistant" && i === messages.length - 1 && loading;
            const isStreamingEmpty = isLastAssistant && msg.content === "";
            return (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-2)] border border-[var(--border)]"
                  }`}
                >
                  {isStreamingEmpty ? (
                    <div className="spinner" aria-label={t("answerGenerating")} />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                      {isLastAssistant && (
                        <span
                          className="inline-block w-1.5 h-3.5 ml-0.5 bg-[var(--muted)] align-middle animate-pulse"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  )}
                  {msg.role === "assistant" && msg.model && (
                    <div className="text-[10px] text-[var(--muted)] mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-1">
                      <Sparkles size={10} />
                      {msg.provider}:{msg.model}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {error && (
            <div className="text-sm text-[var(--red)] bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-[var(--border)] p-3 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            className="input flex-1"
            disabled={loading}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn btn-primary"
          >
            <Send size={14} />
            {t("send")}
          </button>
        </form>
      </div>

      <p className="text-xs text-[var(--muted)] mt-2 text-center">{t("footer")}</p>
    </div>
  );
}
