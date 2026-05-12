import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { connectDB } from "./mongodb";
import { User, type IUser } from "./models/User";
import { Types } from "mongoose";
import { decryptSecret } from "./secretCrypto";

const COOKIE_NAME = "sa_session";
const JWT_SECRET = process.env.JWT_SECRET || "";

// In Production darf die App ohne JWT_SECRET nicht starten — sonst würden
// Sessions mit einem im Code eingebetteten Fallback-Secret signiert, das
// jeder mit Git-Zugriff kennt. Fail-Fast: lieber 500 beim ersten Request als
// stumme Katastrophe.
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "[auth] FATAL: JWT_SECRET ist nicht gesetzt. Produktion wurde blockiert. " +
      "Bitte eine kryptographisch starke Zufalls-Zeichenkette in der Umgebungsvariable JWT_SECRET hinterlegen."
  );
}

const EFFECTIVE_SECRET =
  JWT_SECRET || "dev-fallback-secret-please-set-JWT_SECRET-in-env-local";

const SESSION_DURATION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface TokenPayload {
  userId: string;
  email: string;
}

export function signSessionToken(payload: TokenPayload): string {
  return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: `${SESSION_DURATION_DAYS}d` });
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, EFFECTIVE_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export interface SessionUser {
  _id: Types.ObjectId;
  userId: string;
  email: string;
  name?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  aiProvider?: "claude" | "gemini" | "openai-compat" | "ollama";
  aiProviderOrder?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
  disabledAiProviders?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
  aiDisabled: boolean;
  baseCurrency: string;
  role: "user" | "admin";
  emailVerified: boolean;
  approved: boolean;
  /** Bevorzugte Sprache des Users (z. B. für Mails aus Cron-Jobs). */
  locale?: "de" | "en";
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  await connectDB();
  const user = await User.findById(payload.userId).lean<IUser & { _id: Types.ObjectId }>();
  if (!user) return null;
  // Wenn der Admin einen User nachträglich sperrt, soll die laufende Session
  // sofort invalidiert werden — nicht erst in 30 Tagen beim Ablauf des JWT.
  if (user.approved === false) return null;

  // Aktivitäts-Stempel — gedrosselt auf max. 1× pro 60 s, damit nicht jeder
  // Page-Request einen DB-Write auslöst. Fire-and-forget: scheitert das
  // Update, soll der Login-Flow trotzdem durchgehen.
  const now = Date.now();
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  if (now - lastSeen > 60_000) {
    User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date(now) } }).catch(
      () => {}
    );
  }

  return {
    _id: user._id,
    userId: String(user._id),
    email: user.email,
    name: user.name,
    // API-Keys werden verschlüsselt gespeichert — hier für den Runtime-Gebrauch
    // (KI-Provider-Calls) einmalig entschlüsselt.
    claudeApiKey: decryptSecret(user.claudeApiKey) || undefined,
    claudeModel: user.claudeModel,
    geminiApiKey: decryptSecret(user.geminiApiKey) || undefined,
    geminiModel: user.geminiModel,
    openaiApiKey: decryptSecret(user.openaiApiKey) || undefined,
    openaiBaseUrl: user.openaiBaseUrl,
    openaiModel: user.openaiModel,
    ollamaBaseUrl: user.ollamaBaseUrl,
    ollamaModel: user.ollamaModel,
    aiProvider: user.aiProvider,
    aiProviderOrder: user.aiProviderOrder,
    disabledAiProviders: user.disabledAiProviders,
    aiDisabled: !!user.aiDisabled,
    baseCurrency: user.baseCurrency || "EUR",
    role: user.role || "user",
    emailVerified: !!user.emailVerified,
    // Wir haben oben bereits bei `approved === false` zurückgegeben — hier ist
    // approved garantiert truthy. Trotzdem explizit booleanisieren, damit der
    // SessionUser-Typ nicht versehentlich auf `true` als Literal eingeengt wird.
    approved: !!user.approved,
    locale: user.locale,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Nicht eingeloggt");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthError("Nur für Admins");
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function generateToken(length = 48): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}
