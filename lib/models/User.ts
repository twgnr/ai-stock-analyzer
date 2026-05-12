import mongoose, { Schema, Model } from "mongoose";

export interface IUser {
  email: string;
  passwordHash: string;
  name?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  /** Lokaler Ollama-Server. Kein API-Key (Ollama hat per Default keine Auth).
   *  `ollamaBaseUrl` muss vom Server erreichbar sein — bei Self-Host meist
   *  `http://localhost:11434/v1`, bei Docker ggf. `http://host.docker.internal:11434/v1`. */
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  aiProvider: "claude" | "gemini" | "openai-compat" | "ollama";
  // Resolve-Reihenfolge der Provider. Erster mit Key und nicht disabled
  // gewinnt. Fallback bei leer: [aiProvider, ...rest].
  aiProviderOrder?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
  // Hinterlegte, aber gerade nicht zu nutzende Provider.
  disabledAiProviders?: ("claude" | "gemini" | "openai-compat" | "ollama")[];
  baseCurrency: string;
  role: "user" | "admin";
  emailVerified: boolean;
  approved: boolean;
  lastLoginAt?: Date;
  /** Zuletzt gesehene Aktivität (gebumpt durch authentifizierte Requests).
   *  Dient dem Auto-Update als Signal, ob aktuell überhaupt jemand eingeloggt
   *  ist und es sich lohnt, die Caches zu refreshen. */
  lastSeenAt?: Date;
  digestEnabled: boolean;
  alertsEnabled: boolean;
  notificationEmail?: string;
  totpSecret?: string;
  totpEnabled: boolean;
  /** Benutzer hat seine eigenen KI-Keys vorübergehend gesperrt — führt dazu,
   *  dass alle KI-Features für ihn als „kein Zugriff" zurückgemeldet werden,
   *  auch wenn er gültige Keys hinterlegt hat. Schützt vor versehentlicher
   *  Nutzung und damit vor Kosten. */
  aiDisabled: boolean;
  dashboardWidgets?: { id: string; visible: boolean }[];
  favoriteSections?: string[];
  /** Bevorzugte Sprache des Users für Inhalte, die ausserhalb eines Requests
   *  generiert werden — vor allem E-Mail-Versand aus Cron-Jobs, wo es weder
   *  Cookie noch Accept-Language-Header gibt. UI-Strings nutzen weiterhin den
   *  next-intl-Provider. Default ist `de`, weil das auch der App-Default ist.
   *  Eine spätere Migration könnte den Wert beim ersten Login aus dem
   *  Accept-Language des Browsers ableiten. */
  locale?: "de" | "en";
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, maxlength: 100 },
    claudeApiKey: { type: String, trim: true },
    claudeModel: { type: String, trim: true },
    geminiApiKey: { type: String, trim: true },
    geminiModel: { type: String, trim: true },
    openaiApiKey: { type: String, trim: true },
    openaiBaseUrl: { type: String, trim: true },
    openaiModel: { type: String, trim: true },
    ollamaBaseUrl: { type: String, trim: true },
    ollamaModel: { type: String, trim: true },
    aiProvider: {
      type: String,
      enum: ["claude", "gemini", "openai-compat", "ollama"],
      default: "claude",
    },
    aiProviderOrder: {
      type: [
        {
          type: String,
          enum: ["claude", "gemini", "openai-compat", "ollama"],
        },
      ],
      default: undefined,
    },
    disabledAiProviders: {
      type: [
        {
          type: String,
          enum: ["claude", "gemini", "openai-compat", "ollama"],
        },
      ],
      default: undefined,
    },
    baseCurrency: { type: String, default: "EUR", uppercase: true },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    emailVerified: { type: Boolean, default: false, index: true },
    approved: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date },
    lastSeenAt: { type: Date, index: true },
    digestEnabled: { type: Boolean, default: false },
    alertsEnabled: { type: Boolean, default: true },
    notificationEmail: { type: String, trim: true, lowercase: true },
    totpSecret: { type: String },
    totpEnabled: { type: Boolean, default: false },
    aiDisabled: { type: Boolean, default: false },
    dashboardWidgets: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            visible: { type: Boolean, default: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    favoriteSections: {
      type: [{ type: String }],
      default: undefined,
    },
    locale: {
      type: String,
      enum: ["de", "en"],
      default: "de",
    },
  },
  { timestamps: true }
);

// Next.js Dev-Cache: falls das Model noch ohne neu hinzugekommene Top-Level-
// Felder registriert ist, würden Writes auf diese Felder silent verworfen.
// Deshalb hier alle erforderlichen Felder prüfen und das Model bei
// fehlenden Pfaden neu registrieren. In Production passiert das nur einmal
// beim Boot.
const REQUIRED_USER_FIELDS = ["lastSeenAt", "ollamaBaseUrl", "locale"] as const;
const cachedUser = mongoose.models.User as Model<IUser> | undefined;
if (
  cachedUser &&
  REQUIRED_USER_FIELDS.some((f) => !cachedUser.schema.path(f))
) {
  delete mongoose.models.User;
}

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);
