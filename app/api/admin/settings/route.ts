import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import {
  getAppSettings,
  type IAppSettings,
  type IAppSettingsAi,
  type IQuoteProvidersConfig,
  type IDataSourcesConfig,
  type QuoteProviderKey,
} from "@/lib/models/AppSettings";
import { requireAdmin, AuthError } from "@/lib/auth";
import { getYahooQuotaStatus } from "@/lib/yahooQuota";
import {
  invalidateProviderConfigCache,
  DEFAULT_ORDER,
} from "@/lib/quoteProvider";
import { encryptSecret, decryptSecret } from "@/lib/secretCrypto";
import { validatePublicBaseUrl } from "@/lib/urlSafety";

const VALID_PROVIDERS: readonly QuoteProviderKey[] = [
  "yahoo",
  "finnhub",
  "stooq",
] as const;

function maskKey(key: string | undefined): { set: boolean; hint: string } {
  if (!key || key.length === 0) return { set: false, hint: "" };
  const plain = decryptSecret(key);
  if (!plain) return { set: false, hint: "" };
  const last4 = plain.length > 8 ? plain.slice(-4) : "";
  return { set: true, hint: last4 ? `••••${last4}` : "••••" };
}

// Shared response shape — einmal definiert, damit GET und PATCH garantiert
// dasselbe zurückgeben und neue Felder nicht an einer Stelle vergessen werden.
async function serializeSettings(s: IAppSettings) {
  const ai: IAppSettingsAi = s.ai ?? {};
  const yahoo = await getYahooQuotaStatus();
  const qp: IQuoteProvidersConfig = s.quoteProviders ?? {};
  const orderRaw = (qp.order ?? []).filter((p): p is QuoteProviderKey =>
    VALID_PROVIDERS.includes(p as QuoteProviderKey)
  );
  const order =
    orderRaw.length > 0
      ? (Array.from(new Set([...orderRaw, ...DEFAULT_ORDER])) as QuoteProviderKey[])
      : [...DEFAULT_ORDER];
  return {
    requireApproval: s.requireApproval,
    magazineSharingEnabled: s.magazineSharingEnabled !== false,
    loginNoticeText: s.loginNoticeText || "",
    loginNoticeEnabled: !!s.loginNoticeEnabled,
    yahooDailyQuotaLimit: s.yahooDailyQuotaLimit ?? 5000,
    yahooQuota: {
      date: yahoo.date,
      usedToday: yahoo.usedToday,
      limit: yahoo.limit,
      remaining: yahoo.remaining,
      percentUsed: yahoo.percentUsed,
      lastLimitHitAt: yahoo.lastLimitHitAt ? yahoo.lastLimitHitAt.toISOString() : null,
    },
    moversAutoScan: {
      enabled: !!s.moversAutoScanEnabled,
      provider: s.moversAutoScanProvider === "finnhub" ? "finnhub" : "yahoo",
      intervalMinutes: Math.max(5, s.moversAutoScanIntervalMinutes ?? 30),
      tradingHoursOnly: s.moversAutoScanTradingHoursOnly !== false,
    },
    autoUpdate: {
      enabled: !!s.autoUpdateEnabled,
      intervalMinutes: Math.max(5, s.autoUpdateIntervalMinutes ?? 30),
      lastRunAt: s.autoUpdateLastRunAt ? new Date(s.autoUpdateLastRunAt).toISOString() : null,
      lastDurationMs: s.autoUpdateLastDurationMs ?? null,
      lastTickerCount: s.autoUpdateLastTickerCount ?? null,
    },
    quoteProviders: {
      order,
      yahooEnabled: qp.yahooEnabled !== false,
      finnhubEnabled: qp.finnhubEnabled === true,
      stooqEnabled: qp.stooqEnabled !== false,
      finnhubKey: maskKey(qp.finnhubApiKey),
    },
    ai: {
      claudeKey: maskKey(ai.claudeApiKey),
      claudeModel: ai.claudeModel || "",
      geminiKey: maskKey(ai.geminiApiKey),
      geminiModel: ai.geminiModel || "",
      openaiKey: maskKey(ai.openaiApiKey),
      openaiBaseUrl: ai.openaiBaseUrl || "",
      openaiModel: ai.openaiModel || "",
      allowSharedKeyUsage: !!ai.allowSharedKeyUsage,
      dailyCostLimitUsd: ai.dailyCostLimitUsd ?? 0,
      monthlyCostLimitUsd: ai.monthlyCostLimitUsd ?? 0,
      sharedKeyPaused: !!ai.sharedKeyPaused,
    },
    dataSources: {
      fredKey: maskKey(s.dataSources?.fredApiKey),
      secUserAgent: s.dataSources?.secUserAgent || "",
      redditClientId: s.dataSources?.redditClientId || "",
      redditClientSecret: maskKey(s.dataSources?.redditClientSecret),
    },
  };
}

export async function GET() {
  try {
    await requireAdmin();
    await connectDB();
    const s = await getAppSettings();
    return NextResponse.json(await serializeSettings(s));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    await connectDB();
    const body = await req.json();

    // Dokument laden und direkt mutieren — so greift das aktuelle Schema
    // garantiert, auch in Next.js-Dev-Umgebungen mit gecachtem Model.
    const doc = await getAppSettings();
    let changed = 0;

    if (typeof body.requireApproval === "boolean") {
      doc.requireApproval = body.requireApproval;
      changed++;
    }
    if (typeof body.magazineSharingEnabled === "boolean") {
      doc.magazineSharingEnabled = body.magazineSharingEnabled;
      changed++;
    }
    if (typeof body.loginNoticeText === "string") {
      doc.loginNoticeText = body.loginNoticeText.slice(0, 2000);
      changed++;
    }
    if (typeof body.loginNoticeEnabled === "boolean") {
      doc.loginNoticeEnabled = body.loginNoticeEnabled;
      changed++;
    }
    if (typeof body.yahooDailyQuotaLimit === "number" && body.yahooDailyQuotaLimit >= 0) {
      doc.yahooDailyQuotaLimit = Math.floor(body.yahooDailyQuotaLimit);
      changed++;
    }

    if (body.moversAutoScan && typeof body.moversAutoScan === "object") {
      const mIn = body.moversAutoScan as Record<string, unknown>;
      if (typeof mIn.enabled === "boolean") {
        doc.moversAutoScanEnabled = mIn.enabled;
        changed++;
      }
      if (mIn.provider === "yahoo" || mIn.provider === "finnhub") {
        doc.moversAutoScanProvider = mIn.provider;
        changed++;
      }
      if (
        typeof mIn.intervalMinutes === "number" &&
        Number.isFinite(mIn.intervalMinutes) &&
        mIn.intervalMinutes >= 5
      ) {
        doc.moversAutoScanIntervalMinutes = Math.floor(mIn.intervalMinutes);
        changed++;
      }
      if (typeof mIn.tradingHoursOnly === "boolean") {
        doc.moversAutoScanTradingHoursOnly = mIn.tradingHoursOnly;
        changed++;
      }
    }

    if (body.quoteProviders && typeof body.quoteProviders === "object") {
      if (!doc.quoteProviders) doc.quoteProviders = {} as IQuoteProvidersConfig;
      const qpIn = body.quoteProviders as Record<string, unknown>;
      const qp = doc.quoteProviders;

      if (Array.isArray(qpIn.order)) {
        const seen = new Set<QuoteProviderKey>();
        const clean: QuoteProviderKey[] = [];
        for (const v of qpIn.order) {
          if (typeof v !== "string") continue;
          const k = v as QuoteProviderKey;
          if (!VALID_PROVIDERS.includes(k) || seen.has(k)) continue;
          seen.add(k);
          clean.push(k);
        }
        // Fehlende Provider ans Ende hängen — nichts verschwinden lassen.
        for (const k of DEFAULT_ORDER) if (!seen.has(k)) clean.push(k);
        qp.order = clean;
        changed++;
      }
      if (typeof qpIn.yahooEnabled === "boolean") {
        qp.yahooEnabled = qpIn.yahooEnabled;
        changed++;
      }
      if (typeof qpIn.finnhubEnabled === "boolean") {
        qp.finnhubEnabled = qpIn.finnhubEnabled;
        changed++;
      }
      if (typeof qpIn.stooqEnabled === "boolean") {
        qp.stooqEnabled = qpIn.stooqEnabled;
        changed++;
      }
      if (typeof qpIn.finnhubApiKey === "string") {
        const v = qpIn.finnhubApiKey.trim();
        qp.finnhubApiKey = v ? encryptSecret(v) : "";
        changed++;
      }
      doc.markModified("quoteProviders");
    }

    // AI-Settings: Einzelfelder im Sub-Dokument.
    if (body.ai && typeof body.ai === "object") {
      if (!doc.ai) doc.ai = {} as IAppSettingsAi;
      const aiIn = body.ai as Record<string, unknown>;
      const ai = doc.ai;
      const secretFields: (keyof IAppSettingsAi)[] = [
        "claudeApiKey",
        "geminiApiKey",
        "openaiApiKey",
      ];
      const plainFields: (keyof IAppSettingsAi)[] = [
        "claudeModel",
        "geminiModel",
        "openaiBaseUrl",
        "openaiModel",
      ];
      for (const k of secretFields) {
        if (typeof aiIn[k] === "string") {
          const v = (aiIn[k] as string).trim();
          (ai as Record<string, unknown>)[k] = v ? encryptSecret(v) : "";
          changed++;
        }
      }
      for (const k of plainFields) {
        if (typeof aiIn[k] === "string") {
          const value = (aiIn[k] as string).trim();
          // openaiBaseUrl gegen SSRF härten
          if (k === "openaiBaseUrl" && value) {
            const check = validatePublicBaseUrl(value);
            if (!check.ok) {
              return NextResponse.json(
                { error: `Ungültige OpenAI-Base-URL: ${check.reason}` },
                { status: 400 }
              );
            }
          }
          (ai as Record<string, unknown>)[k] = value;
          changed++;
        }
      }
      if (typeof aiIn.allowSharedKeyUsage === "boolean") {
        ai.allowSharedKeyUsage = aiIn.allowSharedKeyUsage;
        changed++;
      }
      if (typeof aiIn.dailyCostLimitUsd === "number" && aiIn.dailyCostLimitUsd >= 0) {
        ai.dailyCostLimitUsd = aiIn.dailyCostLimitUsd;
        changed++;
      }
      if (typeof aiIn.monthlyCostLimitUsd === "number" && aiIn.monthlyCostLimitUsd >= 0) {
        ai.monthlyCostLimitUsd = aiIn.monthlyCostLimitUsd;
        changed++;
      }
      if (typeof aiIn.sharedKeyPaused === "boolean") {
        ai.sharedKeyPaused = aiIn.sharedKeyPaused;
        changed++;
      }
      // Mongoose weiß bei Sub-Doc-Mutationen nicht immer, dass sich etwas
      // geändert hat — explizit markieren.
      doc.markModified("ai");
    }

    // Auto-Update (Portfolios + Watchlists + Movers).
    if (body.autoUpdate && typeof body.autoUpdate === "object") {
      const auIn = body.autoUpdate as Record<string, unknown>;
      if (typeof auIn.enabled === "boolean") {
        doc.autoUpdateEnabled = auIn.enabled;
        changed++;
      }
      if (
        typeof auIn.intervalMinutes === "number" &&
        Number.isFinite(auIn.intervalMinutes)
      ) {
        const v = Math.max(5, Math.round(auIn.intervalMinutes));
        if (v > 24 * 60) {
          return NextResponse.json(
            { error: "Intervall maximal 1440 Minuten (24h)." },
            { status: 400 }
          );
        }
        doc.autoUpdateIntervalMinutes = v;
        changed++;
      }
    }

    // Externe Datenquellen (FRED, SEC etc.).
    if (body.dataSources && typeof body.dataSources === "object") {
      if (!doc.dataSources) doc.dataSources = {} as IDataSourcesConfig;
      const dsIn = body.dataSources as Record<string, unknown>;
      const ds = doc.dataSources;
      if (typeof dsIn.fredApiKey === "string") {
        const v = (dsIn.fredApiKey as string).trim();
        ds.fredApiKey = v ? encryptSecret(v) : "";
        changed++;
      }
      if (typeof dsIn.secUserAgent === "string") {
        const ua = (dsIn.secUserAgent as string).trim();
        // SEC will eine identifizierende Zeile mit E-Mail.
        if (ua && !/@/.test(ua)) {
          return NextResponse.json(
            {
              error:
                "SEC verlangt einen User-Agent mit E-Mail-Adresse, z. B. „MyApp Tobias name@example.com“.",
            },
            { status: 400 }
          );
        }
        if (ua.length > 200) {
          return NextResponse.json(
            { error: "User-Agent zu lang (max. 200 Zeichen)." },
            { status: 400 }
          );
        }
        ds.secUserAgent = ua;
        changed++;
      }
      if (typeof dsIn.redditClientId === "string") {
        const v = (dsIn.redditClientId as string).trim();
        if (v.length > 100) {
          return NextResponse.json(
            { error: "Reddit Client-ID zu lang." },
            { status: 400 }
          );
        }
        ds.redditClientId = v;
        changed++;
      }
      if (typeof dsIn.redditClientSecret === "string") {
        const v = (dsIn.redditClientSecret as string).trim();
        ds.redditClientSecret = v ? encryptSecret(v) : "";
        changed++;
      }
      doc.markModified("dataSources");
    }

    if (changed === 0) {
      return NextResponse.json({ error: "Keine Änderungen" }, { status: 400 });
    }

    await doc.save();
    invalidateProviderConfigCache();
    return NextResponse.json(await serializeSettings(doc));
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Fehler";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
