import crypto from "node:crypto";

/**
 * Envelope-Verschlüsselung für API-Keys at rest.
 *
 * Format in der DB: `enc:v1:{ivHex}:{authTagHex}:{cipherHex}`
 *
 * Bestehende Plaintext-Keys (ohne Prefix) werden beim Lesen 1:1 zurück-
 * geliefert — so bleibt die App auch ohne Migration funktionsfähig. Beim
 * nächsten Schreibvorgang werden sie automatisch verschlüsselt abgelegt.
 */

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
const KEY_ENV = "APP_SECRET_KEY";

function loadKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw || raw.trim().length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `${KEY_ENV} ist nicht gesetzt. API-Keys können nicht verschlüsselt werden.`
      );
    }
    // Dev-Fallback: deterministisch aus JWT_SECRET ableiten, damit lokale
    // Entwicklung ohne Extra-Setup läuft. In Produktion IMMER einen dedizierten
    // 32-Byte Hex-Key setzen.
    const seed = process.env.JWT_SECRET || "dev-app-secret-please-set-APP_SECRET_KEY";
    return crypto.createHash("sha256").update(seed).digest();
  }
  // Akzeptiere 64 Hex-Zeichen (32 Byte) oder eine beliebige Passphrase (wird
  // auf 32 Byte SHA-256-geshasht)
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    return Buffer.from(raw.trim(), "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

export function encryptSecret(plain: string | undefined | null): string {
  if (plain == null || plain === "") return "";
  if (plain.startsWith(PREFIX)) return plain; // schon verschlüsselt
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(stored: string | undefined | null): string {
  if (stored == null || stored === "") return "";
  if (!stored.startsWith(PREFIX)) return stored; // Legacy-Plaintext
  const rest = stored.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 3) return "";
  try {
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const ct = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    // Key rotiert, Format inkorrekt, Tag-Mismatch — Treat as empty
    return "";
  }
}

export function isEncrypted(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}
