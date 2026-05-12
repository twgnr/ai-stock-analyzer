import { yahooFinance } from "./yahoo";

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { rate: number; at: number }>();

export const BASE_CURRENCY = "EUR";

export async function getRate(from: string, to: string = BASE_CURRENCY): Promise<number> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;

  const key = `${f}${t}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rate;

  try {
    const q = await yahooFinance.quote(`${f}${t}=X`);
    const rate = q?.regularMarketPrice;
    if (typeof rate !== "number" || !(rate > 0)) {
      throw new Error(`Kein FX-Kurs für ${f}->${t}`);
    }
    cache.set(key, { rate, at: Date.now() });
    return rate;
  } catch (e) {
    const reverse = cache.get(`${t}${f}`);
    if (reverse && reverse.rate > 0) return 1 / reverse.rate;
    throw e;
  }
}

export async function getRates(
  currencies: string[],
  base: string = BASE_CURRENCY
): Promise<Record<string, number>> {
  const unique = [...new Set(currencies.map((c) => c.toUpperCase()))];
  const results = await Promise.all(
    unique.map(async (c) => {
      try {
        return [c, await getRate(c, base)] as const;
      } catch {
        return [c, null] as const;
      }
    })
  );
  const out: Record<string, number> = {};
  for (const [c, r] of results) {
    if (r != null) out[c] = r;
  }
  return out;
}

export function convert(amount: number, rate: number): number {
  return amount * rate;
}
