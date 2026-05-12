import mongoose, { Schema, Model } from "mongoose";

export interface IMoverRow {
  ticker: string;
  name?: string;
  price: number;
  changePct: number;
  currency: string;
  marketCap?: number;
}

/**
 * Ein Snapshot pro Index-Key (dax/mdax/sdax/tecdax/xetra/dow/sp500/nasdaq100).
 * Rows sind die komplette Index-Liste, sortiert nach Tages-% absteigend —
 * Top 10 / Flop 10 leiten sich daraus ab. Shared für alle User.
 */
export interface IMarketMoversSnapshot {
  indexKey: string;
  rows: IMoverRow[];
  scannedAt?: Date;
  scannedByEmail?: string;
  scannedByName?: string;
  universeSize: number;
  scanDurationMs?: number;
  scanInProgress: boolean;
  scanStartedAt?: Date;
  /** Letzter Zeitpunkt, zu dem irgendein User diesen Index im Widget
   *  angezeigt bekam. Wird vom Autoscan genutzt, um ungeöffnete Indizes
   *  nicht unnötig zu scannen. */
  lastViewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<IMarketMoversSnapshot>(
  {
    indexKey: { type: String, required: true, unique: true, index: true },
    rows: { type: Schema.Types.Mixed, default: [] },
    scannedAt: { type: Date },
    scannedByEmail: { type: String },
    scannedByName: { type: String },
    universeSize: { type: Number, default: 0 },
    scanDurationMs: { type: Number },
    scanInProgress: { type: Boolean, default: false },
    scanStartedAt: { type: Date },
    lastViewedAt: { type: Date },
  },
  { timestamps: true }
);

// Next.js Dev-Cache: falls das Model bereits ohne `lastViewedAt` registriert
// ist, neu anlegen. In Production passiert das nur einmal beim Boot.
const cachedMovers = mongoose.models.MarketMoversSnapshot as
  | Model<IMarketMoversSnapshot>
  | undefined;
if (cachedMovers && !cachedMovers.schema.path("lastViewedAt")) {
  delete mongoose.models.MarketMoversSnapshot;
}

export const MarketMoversSnapshot: Model<IMarketMoversSnapshot> =
  (mongoose.models.MarketMoversSnapshot as Model<IMarketMoversSnapshot>) ||
  mongoose.model<IMarketMoversSnapshot>(
    "MarketMoversSnapshot",
    SnapshotSchema
  );
