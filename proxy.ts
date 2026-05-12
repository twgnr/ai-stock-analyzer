import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// In Next.js 16 heißt das bisherige `middleware` jetzt `proxy`. Funktional
// unverändert — das Framework erwartet nur anderen Datei- und Export-Namen.

const intlMiddleware = createIntlMiddleware(routing);

// Pfade, die ohne Login erreichbar sind. Wird nach dem Stripping des
// Locale-Prefix (/de, /en) gegen den eingehenden Pfad gematcht.
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/impressum",
  "/datenschutz",
  "/barrierefreiheit",
  "/hilfe",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/public/login-notice",
];

const IS_PROD = process.env.NODE_ENV === "production";

// Regex zum Strippen des Locale-Prefix aus dem URL-Pfad. Achtung: nur die
// echten Locales (de, en) matchen — Pfade wie /demo oder /english bleiben
// unverändert.
const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

// Next.js + Tailwind injizieren inline-Scripts/Styles zur Runtime. Ohne
// Nonce-Infrastruktur lässt sich das nur via 'unsafe-inline' erlauben.
// `unsafe-eval` wird im Next.js-Dev-Server für HMR benötigt — in Production
// (nach `next build`) nicht mehr. Es dort zu entfernen härtet den XSS-Schutz
// deutlich, da ein injiziertes Script dann kein `eval(attackerSource)`
// ausführen kann.
// Bilder, Fonts und XHR bewusst weit offen, weil wir Yahoo/Reddit-Vorschaubilder
// und externe Font-Stylesheets einbinden.
const scriptSrc = IS_PROD
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(IS_PROD ? ["upgrade-insecure-requests"] : []),
].join("; ");

function addSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (IS_PROD) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  return res;
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    /\.(ico|png|jpg|jpeg|svg|webp|css|js|mjs|json|webmanifest|woff2?|map)$/.test(pathname)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // 1) Locale-Routing nur für Page-Requests durch next-intl jagen. API- und
  //    Static-Asset-Requests bekommen kein Locale-Prefix.
  const intlResponse =
    isApi || isStaticAsset(pathname) ? NextResponse.next() : intlMiddleware(req);

  // 2) Wenn next-intl umleitet (z.B. /en/portfolio wenn Cookie auf EN steht
  //    und URL /portfolio war), Redirect direkt durchlassen — Auth-Check
  //    läuft auf dem nächsten Request am Ziel.
  if (intlResponse.status === 307 || intlResponse.status === 308) {
    return addSecurityHeaders(intlResponse);
  }

  // 3) Auth-Check: Locale-Prefix vom Pfad strippen, dann gegen PUBLIC_PATHS.
  const strippedPath = pathname.replace(LOCALE_PREFIX, "") || "/";
  const token = req.cookies.get("sa_session")?.value;
  const isPublicPath =
    PUBLIC_PATHS.some((p) => strippedPath === p || strippedPath.startsWith(`${p}/`)) ||
    isStaticAsset(pathname);

  if (isPublicPath) return addSecurityHeaders(intlResponse);

  if (!token) {
    if (isApi) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      );
    }
    // Locale beibehalten beim Login-Redirect, damit der User sprachstabil
    // wieder landet wo er hinwollte.
    const localeMatch = pathname.match(LOCALE_PREFIX);
    const localePrefix = localeMatch ? localeMatch[0] : "";
    const loginUrl = new URL(`${localePrefix}/login`, req.url);
    loginUrl.searchParams.set("next", pathname);
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return addSecurityHeaders(intlResponse);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
