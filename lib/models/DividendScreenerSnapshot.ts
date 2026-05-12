import mongoose, { Schema, Model } from "mongoose";
import type { DividendRow } from "../dividendScreener";

/**
 * Singleton-Dokument (key: "global") mit dem geteilten Scan-Ergebnis
 * der kuratierten Dividenden-Liste. Alle User sehen denselben Stand;
 * jeder kann einen Neu-Scan triggern, der die Daten für alle auffrischt.
 *
 * Rows werden als freies Schema-less-Array gespeichert, weil DividendRow
 * mehrere optionale Felder hat und wir keine schemagetriebene Validierung
 * brauchen (die Datenquelle ist unsere eigene getCurrentSharedSnapshot-Logik).
 */
export interface IDividendScreenerSnapshot {
  key: string;
  rows: DividendRow[];
  scannedAt?: Date;
  scannedByEmail?: string;
  scannedByName?: string;
  universeSize: number;
  scanDurationMs?: number;
  scanInProgress: boolean;
  scanStartedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SnapshotSchema = new Schema<IDividendScreenerSnapshot>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    rows: { type: Schema.Types.Mixed, default: [] },
    scannedAt: { type: Date },
    scannedByEmail: { type: String },
    scannedByName: { type: String },
    universeSize: { type: Number, default: 0 },
    scanDurationMs: { type: Number },
    scanInProgress: { type: Boolean, default: false },
    scanStartedAt: { type: Date },
  },
  { timestamps: true }
);

export const DividendScreenerSnapshot: Model<IDividendScreenerSnapshot> =
  mongoose.models.DividendScreenerSnapshot ||
  mongoose.model<IDividendScreenerSnapshot>(
    "DividendScreenerSnapshot",
    SnapshotSchema
  );
