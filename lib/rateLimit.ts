import { NextRequest } from "next/server";

interface Entry {
  count: number;
  windowStart: number;
}

const store = new Map<string, Entry>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, retryAfter: 0 };
  }

  if (existing.count >= maxRequests) {
    const retryAfter = Math.ceil((existing.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  existing.count += 1;
  return { allowed: true, remaining: maxRequests - existing.count, retryAfter: 0 };
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Hilfs-Helper für API-Routen, die einen eingeloggten User + Limit pro User
 * haben. Gibt bei Überschreitung direkt die Response zurück, die der Handler
 * vorzeitig zurückwerfen soll — oder `null`, wenn der Request passieren darf.
 *
 *   const limited = rateLimitResponse(`ai:${user.userId}`, 30, 60 * 60);
 *   if (limited) return limited;
 */
export function rateLimitResponse(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Response | null {
  const r = rateLimit(key, maxRequests, windowSeconds);
  if (r.allowed) return null;
  return new Response(
    JSON.stringify({
      error: `Zu viele Anfragen. Bitte in ${r.retryAfter} Sekunden erneut.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(r.retryAfter),
      },
    }
  );
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 24 * 60 * 60 * 1000) store.delete(key);
  }
}, 60 * 60 * 1000);
