import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export interface IAppSettingsAi {
  /** Admin-hinterlegter Claude-Key als Fallback für User ohne eigenen Key. */
  claudeApiKey?: string;
  claudeModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  /** Darf ein User ohne eigenen Key den Admin-Key nutzen? */
  allowSharedKeyUsage?: boolean;
  /** Kosten-Limit pro User und Tag in USD (nur für Shared-Key). 0 = unbegrenzt */
  dailyCostLimitUsd?: number;
  /** Kosten-Limit pro User und Monat in USD (nur für Shared-Key). 0 = unbegrenzt */
  monthlyCostLimitUsd?: number;
  /** Not-Aus für alle Shared-Key-Anfragen. Ist unabhängig von allowSharedKeyUsage,
   *  so dass Admin eine Pause einlegen kann ohne die Konfiguration zu verlieren. */
  sharedKeyPaused?: boolean;
}

export interface IAppSettings {
  key: string;
  requireApproval: boolean;
  magazineSharingEnabled: boolean;
  /** Hinweistext, der über dem Login-Block angezeigt wird (Markdown-frei,
   *  reiner Text). Leer = kein Hinweis. */
  loginNoticeText?: string;
  /** Steuerung, ob der Text aktuell angezeigt wird. So lässt er sich speichern
   *  ohne ihn live auf der Login-Seite zu zeigen. */
  loginNoticeEnabled?: boolean;
  /** Maximale Zahl an Yahoo-Finance-Requests pro Kalendertag (UTC).
   *  0 = unbegrenzt. Überschreitet die Anwendung das Limit, wird jeder
   *  weitere Yahoo-Aufruf für diesen Tag blockiert. Der Zähler resetet
   *  um 00:00 UTC. */
  yahooDailyQuotaLimit?: number;
  /** Kurs-Provider-Kaskade. Die Reihenfolge bestimmt, in welcher die Provider
   *  für getQuote() probiert werden. Deaktivierte Provider werden übersprungen.
   *  Gilt ausschließlich für Einzel-Quote-Abrufe — Fundamentals, Charts etc.
   *  kommen weiterhin aus Yahoo. */
  quoteProviders?: IQuoteProvidersConfig;
  /** Top-10/Flop-10 automatisch aktualisieren, wenn ein User online ist. */
  moversAutoScanEnabled?: boolean;
  /** Datenquelle für den Auto-Scan */
  moversAutoScanProvider?: "yahoo" | "finnhub";
  /** Intervall in Minuten (mindestens 5, empfohlen 30) */
  moversAutoScanIntervalMinutes?: number;
  /** Auf Börsenzeiten beschränken (empfohlen) */
  moversAutoScanTradingHoursOnly?: boolean;
  /** Auto-Update für alle User: Portfolios, Watchlists und Movers werden
   *  in einem konfigurierbaren Intervall serverseitig aktualisiert. */
  autoUpdateEnabled?: boolean;
  /** Intervall in Minuten (mindestens 5). Default 30. */
  autoUpdateIntervalMinutes?: number;
  /** Zeitstempel des letzten erfolgreichen Auto-Update-Durchlaufs. */
  autoUpdateLastRunAt?: Date;
  /** Dauer des letzten Durchlaufs in Millisekunden. */
  autoUpdateLastDurationMs?: number;
  /** Anzahl der eindeutigen Tickers, die im letzten Lauf aktualisiert wurden. */
  autoUpdateLastTickerCount?: number;
  ai?: IAppSettingsAi;
  dataSources?: IDataSourcesConfig;
  updatedAt: Date;
  createdAt: Date;
}

export type QuoteProviderKey = "yahoo" | "finnhub" | "stooq";

export interface IQuoteProvidersConfig {
  order?: QuoteProviderKey[];
  yahooEnabled?: boolean;
  finnhubEnabled?: boolean;
  stooqEnabled?: boolean;
  finnhubApiKey?: string;
}

export interface IDataSourcesConfig {
  /** FRED-API-Key (St. Louis Fed) für Makro-Indikatoren in
   *  Macro-Szenarien und im Wochen-Briefing. Verschlüsselt at rest. */
  fredApiKey?: string;
  /** SEC EDGAR akzeptiert Anfragen nur mit identifizierendem User-Agent
   *  (Policy: „Sample Company Name AdminContact@samplecompany.com").
   *  Pflicht-Feld, sonst antwortet SEC mit 403. */
  secUserAgent?: string;
  /** Reddit OAuth — Client-ID einer registrierten App auf reddit.com/prefs/apps.
   *  Mit OAuth steigt das Rate-Limit auf 60–600 Requests/Min und 429-/403-
   *  Antworten werden viel seltener. Ohne ID läuft Reddit weiter anonym. */
  redditClientId?: string;
  /** Reddit OAuth Client-Secret. Verschlüsselt at rest. */
  redditClientSecret?: string;
}

const AiSchema = new Schema<IAppSettingsAi>(
  {
    claudeApiKey: { type: String, trim: true },
    claudeModel: { type: String, trim: true },
    geminiApiKey: { type: String, trim: true },
    geminiModel: { type: String, trim: true },
    openaiApiKey: { type: String, trim: true },
    openaiBaseUrl: { type: String, trim: true },
    openaiModel: { type: String, trim: true },
    allowSharedKeyUsage: { type: Boolean, default: false },
    dailyCostLimitUsd: { type: Number, default: 0 },
    monthlyCostLimitUsd: { type: Number, default: 0 },
    sharedKeyPaused: { type: Boolean, default: false },
  },
  { _id: false }
);

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    requireApproval: { type: Boolean, default: false },
    magazineSharingEnabled: { type: Boolean, default: true },
    loginNoticeText: { type: String, default: "", maxlength: 2000 },
    loginNoticeEnabled: { type: Boolean, default: false },
    yahooDailyQuotaLimit: { type: Number, default: 5000, min: 0 },
    moversAutoScanEnabled: { type: Boolean, default: false },
    moversAutoScanProvider: {
      type: String,
      enum: ["yahoo", "finnhub"],
      default: "yahoo",
    },
    moversAutoScanIntervalMinutes: { type: Number, default: 30, min: 5 },
    moversAutoScanTradingHoursOnly: { type: Boolean, default: true },
    autoUpdateEnabled: { type: Boolean, default: false },
    autoUpdateIntervalMinutes: { type: Number, default: 30, min: 5 },
    autoUpdateLastRunAt: { type: Date },
    autoUpdateLastDurationMs: { type: Number },
    autoUpdateLastTickerCount: { type: Number },
    quoteProviders: {
      type: new Schema<IQuoteProvidersConfig>(
        {
          order: {
            type: [String],
            default: ["yahoo", "finnhub", "stooq"],
            enum: ["yahoo", "finnhub", "stooq"],
          },
          yahooEnabled: { type: Boolean, default: true },
          finnhubEnabled: { type: Boolean, default: false },
          stooqEnabled: { type: Boolean, default: true },
          finnhubApiKey: { type: String, trim: true, default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    ai: { type: AiSchema, default: () => ({}) },
    dataSources: {
      type: new Schema<IDataSourcesConfig>(
        {
          fredApiKey: { type: String, trim: true, default: "" },
          secUserAgent: { type: String, trim: true, default: "" },
          redditClientId: { type: String, trim: true, default: "" },
          redditClientSecret: { type: String, trim: true, default: "" },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// Next.js Dev-Mode hält das Model im Prozess-Cache. Wenn zwischendurch neue
// Schema-Felder dazukommen, kennt das gecachte Model sie nicht und verwirft
// Writes auf diese Felder silent. Deshalb prüfen wir bei jedem Import, ob das
// gecachte Schema alle aktuellen Top-Level-Felder kennt — und registrieren es
// andernfalls neu. In Production passiert das nur einmal beim Boot.
const REQUIRED_FIELDS: (keyof IAppSettings)[] = [
  "loginNoticeText",
  "loginNoticeEnabled",
  "yahooDailyQuotaLimit",
  "quoteProviders",
  "moversAutoScanEnabled",
  "dataSources",
  "autoUpdateEnabled",
];
const cached = mongoose.models.AppSettings as Model<IAppSettings> | undefined;
const cachedOutdated =
  cached &&
  REQUIRED_FIELDS.some((f) => !cached.schema.path(f as string));
if (cachedOutdated) {
  delete mongoose.models.AppSettings;
}

export const AppSettings: Model<IAppSettings> =
  (mongoose.models.AppSettings as Model<IAppSettings>) ||
  mongoose.model<IAppSettings>("AppSettings", AppSettingsSchema);

export type AppSettingsDoc = HydratedDocument<IAppSettings>;

export async function getAppSettings(): Promise<AppSettingsDoc> {
  const existing = await AppSettings.findOne({ key: "global" });
  if (existing) return existing;
  return AppSettings.create({ key: "global", requireApproval: false });
}
