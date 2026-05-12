/**
 * Passwort-Policy.
 *
 * Orientiert an NIST SP 800-63B: Länge wichtiger als erzwungene
 * Zeichenklassen. Wir verlangen deshalb:
 *  - mindestens 10 Zeichen
 *  - nicht ausschließlich eine Zeichenart (nicht nur Zahlen, nicht nur
 *    Kleinbuchstaben usw.)
 *  - kein Passwort aus der statischen Blacklist häufig kompromittierter
 *    Fälle (obere Klassiker, die in jedem Dump auftauchen)
 *  - Passwort darf keine großen Fragmente der E-Mail oder des Namens
 *    enthalten
 */

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 128;

// Kurze, bewusst gewählte Blacklist der meist-verbreiteten Muster. Eine
// vollständige zxcvbn-Integration wäre besser, verdoppelt aber das Bundle —
// für den Anfang reichen die Top-Treffer aus Have-I-Been-Pwned.
const PASSWORD_BLACKLIST = new Set([
  "password",
  "passwort",
  "password1",
  "passwort1",
  "passwort123",
  "password123",
  "qwertz12345",
  "qwertyuiop",
  "12345678",
  "123456789",
  "1234567890",
  "abcdefghij",
  "letmein123",
  "welcome123",
  "admin12345",
  "iloveyou1",
  "masterkey1",
  "football1",
  "princess1",
  "dragon1234",
]);

export interface PasswordCheckResult {
  ok: boolean;
  error?: string;
}

/**
 * Prüft ein Passwort gegen die Policy. Optional können E-Mail und Name
 * übergeben werden — der Check verwirft Passwörter, die Teile davon
 * enthalten (Konten wie „max.mustermann → MaxMuster1").
 */
export function checkPasswordStrength(
  password: string,
  context: { email?: string; name?: string } = {}
): PasswordCheckResult {
  if (typeof password !== "string") {
    return { ok: false, error: "Passwort erforderlich." };
  }
  if (password.length < MIN_LENGTH) {
    return {
      ok: false,
      error: `Passwort muss mindestens ${MIN_LENGTH} Zeichen haben.`,
    };
  }
  if (password.length > MAX_LENGTH) {
    return {
      ok: false,
      error: `Passwort darf höchstens ${MAX_LENGTH} Zeichen haben.`,
    };
  }
  if (/^\s+$|\s+$/.test(password)) {
    return { ok: false, error: "Passwort darf nicht mit Leerzeichen beginnen oder enden." };
  }

  // Komplexität: mindestens zwei verschiedene Zeichenklassen
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 2) {
    return {
      ok: false,
      error:
        "Passwort zu einfach. Bitte mindestens zwei Zeichenarten kombinieren (Buchstaben, Zahlen oder Sonderzeichen).",
    };
  }

  // Nur Wiederholungen eines einzigen Zeichens (z.B. "aaaaaaaaaa")
  if (/^(.)\1+$/.test(password)) {
    return { ok: false, error: "Passwort zu simpel (nur wiederholte Zeichen)." };
  }

  // Blacklist
  const lower = password.toLowerCase();
  if (PASSWORD_BLACKLIST.has(lower)) {
    return {
      ok: false,
      error:
        "Dieses Passwort ist zu bekannt. Bitte ein weniger verbreitetes wählen.",
    };
  }

  // Eigenbezug: darf nicht nennenswerten Teil der E-Mail oder des Namens enthalten
  const emailLocal = (context.email || "").toLowerCase().split("@")[0] || "";
  if (emailLocal.length >= 4 && lower.includes(emailLocal)) {
    return {
      ok: false,
      error: "Passwort darf keinen Teil deiner E-Mail-Adresse enthalten.",
    };
  }
  const name = (context.name || "").toLowerCase();
  if (name.length >= 4 && lower.includes(name)) {
    return {
      ok: false,
      error: "Passwort darf deinen Namen nicht enthalten.",
    };
  }

  return { ok: true };
}
