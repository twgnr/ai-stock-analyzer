/**
 * Einfache SSRF-Härtung für User-gesetzte URLs (z.B. openaiBaseUrl).
 *
 * Verhindert, dass ein User den Server dazu bringt, interne oder
 * Loopback-Adressen anzusprechen. Öffentliche DNS-Namen werden nicht
 * vorab aufgelöst — das würde zwar DNS-Rebinding ganz verhindern, macht
 * die Validierung aber asynchron und bringt eigene Angriffsfläche
 * (resolver-Timing). Für unseren Use-Case reicht eine syntaktische
 * Sperre gegen offensichtliche interne Ziele.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

const PRIVATE_IPV4_PREFIXES = [
  "10.",
  "127.",
  "169.254.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "0.",
];

function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  return PRIVATE_IPV4_PREFIXES.some((p) => host.startsWith(p));
}

function isBlockedIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  // IPv4-mapped loopback: ::ffff:127.0.0.1
  if (/^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) {
    const v4 = h.split(":").pop() || "";
    return isPrivateIpv4(v4);
  }
  return false;
}

export interface UrlCheckResult {
  ok: boolean;
  reason?: string;
}

export function validatePublicBaseUrl(input: string): UrlCheckResult {
  const raw = input.trim();
  if (raw === "") return { ok: true };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Keine gültige URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Nur http(s)-URLs sind erlaubt." };
  }
  if (process.env.NODE_ENV === "production" && url.protocol === "http:") {
    // In Prod erzwingen wir HTTPS gegen Man-in-the-Middle
    return { ok: false, reason: "In Produktion sind nur HTTPS-URLs erlaubt." };
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `Host ${host} ist blockiert.` };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, reason: "Private/Loopback-IPv4-Adressen sind nicht erlaubt." };
  }
  if (host.startsWith("[") || host.includes(":")) {
    if (isBlockedIpv6(host)) {
      return { ok: false, reason: "Private/Loopback-IPv6-Adressen sind nicht erlaubt." };
    }
  }
  // `.internal` / `.local` / `.lan` sind gängige interne Domains
  if (/\.(internal|local|lan|intranet)$/.test(host)) {
    return { ok: false, reason: `Interne Domain ${host} ist blockiert.` };
  }
  return { ok: true };
}

/**
 * Validierung für die Ollama-Base-URL. Lokales Ollama läuft per Definition
 * auf localhost (z. B. `http://localhost:11434/v1`) oder auf einem privaten
 * Netz-Host (`http://192.168.1.10:11434/v1`, `http://host.docker.internal:11434/v1`).
 * Das Public-Validator-Regelwerk würde all das blocken — hier wollen wir
 * solche Ziele explizit erlauben, weil der User bewusst lokal arbeitet.
 *
 * Was bleibt verboten:
 *  - Nicht-http(s)-Schemas (file://, data:, javascript:)
 *  - Komplett fehlerhafte URLs
 *
 * Wir senden hier serverseitig Anfragen an die URL — der User muss sich
 * der SSRF-Implikation bewusst sein und der UI-Hinweis weist darauf hin.
 * In einer SaaS-Mehrbenutzer-Umgebung sollte Ollama-Support deshalb
 * idealerweise über eine Allowlist eingeschränkt sein; bei Self-Host (was
 * der typische Anwendungsfall ist) ist das Risiko vernachlässigbar.
 */
export function validateOllamaBaseUrl(input: string): UrlCheckResult {
  const raw = input.trim();
  if (raw === "") return { ok: true };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Keine gültige URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Nur http(s)-URLs sind erlaubt." };
  }
  return { ok: true };
}
