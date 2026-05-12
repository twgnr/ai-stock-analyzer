import { getAppSettings } from "./models/AppSettings";
import type {
  QuoteProviderKey,
  IQuoteProvidersConfig,
} from "./models/AppSettings";
import { decryptSecret } from "./secretCrypto";

export type { QuoteProviderKey };

export const DEFAULT_ORDER: QuoteProviderKey[] = ["yahoo", "finnhub", "stooq"];
const VALID: readonly QuoteProviderKey[] = ["yahoo", "finnhub", "stooq"] as const;

export interface ResolvedProviderConfig {
  order: QuoteProviderKey[];
  enabled: Record<QuoteProviderKey, boolean>;
  finnhubApiKey: string;
}

const CACHE_TTL_MS = 15 * 1000;
let cache: { cfg: ResolvedProviderConfig; at: number } | null = null;

function sanitizeOrder(raw: unknown): QuoteProviderKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ORDER];
  const seen = new Set<QuoteProviderKey>();
  const out: QuoteProviderKey[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const k = v as QuoteProviderKey;
    if (!VALID.includes(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  // Fehlende Provider am Ende anhängen — so gehen durch Teil-Konfig keine
  // Provider verloren.
  for (const k of DEFAULT_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

export async function getProviderConfig(force = false): Promise<ResolvedProviderConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cfg;
  const s = await getAppSettings();
  const qp: IQuoteProvidersConfig = s.quoteProviders ?? {};
  const cfg: ResolvedProviderConfig = {
    order: sanitizeOrder(qp.order),
    enabled: {
      yahoo: qp.yahooEnabled !== false,
      finnhub: qp.finnhubEnabled === true,
      stooq: qp.stooqEnabled !== false,
    },
    finnhubApiKey: decryptSecret(qp.finnhubApiKey) || "",
  };
  cache = { cfg, at: Date.now() };
  return cfg;
}

/** Für die Admin-API: sofortige Invalidierung nach PATCH */
export function invalidateProviderConfigCache(): void {
  cache = null;
}
