import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  askPortfolio,
  streamAskPortfolio,
  type ChatMessage,
  hasClaudeKey,
} from "@/lib/claude";
import { buildPortfolioContextForChat } from "@/lib/chatContext";
import { rateLimitResponse } from "@/lib/rateLimit";
import { getApiTranslations } from "@/lib/i18n-server";

// Max. Länge für eine einzelne User-Nachricht im Chat. Schützt vor
// Kostenmissbrauch durch riesige Prompts.
const MAX_MESSAGE_CHARS = 8000;
// Max. Gesamtgröße der Konversation. Verhindert, dass ein Angreifer Hunderte
// großer Messages durchsendet.
const MAX_TOTAL_CHARS = 40000;

interface ContextCache {
  at: number;
  context: string;
}

const CONTEXT_TTL_MS = 5 * 60 * 1000;
const contextCache = new Map<string, ContextCache>();

export async function POST(req: NextRequest) {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });

  const limited = rateLimitResponse(`chat:${user.userId}`, 30, 60 * 60);
  if (limited) return limited;

  if (!(await hasClaudeKey(user))) {
    return NextResponse.json(
      { error: t("ai.noKey") },
      { status: 503 }
    );
  }

  const body = await req.json();
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: t("validation.messagesMissing") }, { status: 400 });
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || !last.content?.trim()) {
    return NextResponse.json({ error: t("validation.lastMessageMustBeUser") }, { status: 400 });
  }

  // Längen-Limit: verhindert unbounded Kosten bei der KI.
  let totalChars = 0;
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Nachricht zu lang (max. ${MAX_MESSAGE_CHARS} Zeichen).` },
        { status: 413 }
      );
    }
    totalChars += m.content.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json(
      { error: `Konversation zu lang (max. ${MAX_TOTAL_CHARS} Zeichen insgesamt).` },
      { status: 413 }
    );
  }

  try {
    const userKey = String(user._id);
    const hit = contextCache.get(userKey);
    let context: string;
    if (hit && Date.now() - hit.at < CONTEXT_TTL_MS) {
      context = hit.context;
    } else {
      context = await buildPortfolioContextForChat(user._id);
      contextCache.set(userKey, { at: Date.now(), context });
    }

    // SSE wenn der Client das explizit verlangt — sonst klassischer JSON-
    // Block-Pfad (Backwards-Compat, falls jemand mit `fetch` ohne Header ruft).
    const wantsStream = req.headers.get("accept")?.includes("text/event-stream");
    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          function send(payload: object) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
          try {
            for await (const chunk of streamAskPortfolio(context, messages, user!)) {
              if (chunk.type === "text") send({ delta: chunk.delta });
              else if (chunk.type === "meta")
                send({ meta: { model: chunk.model, provider: chunk.provider } });
            }
            send({ done: true });
          } catch (e) {
            send({ error: e instanceof Error ? e.message : "Chat-Fehler" });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await askPortfolio(context, messages, user);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat-Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const t = await getApiTranslations();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: t("auth.notAuthenticated") }, { status: 401 });
  contextCache.delete(String(user._id));
  return NextResponse.json({ ok: true });
}
