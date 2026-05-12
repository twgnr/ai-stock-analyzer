import mongoose, { Schema, Model, Types } from "mongoose";

export type ThesisStatus = "ACTIVE" | "ON_TRACK" | "AT_RISK" | "BROKEN" | "CLOSED";

export interface IInvestmentThesis {
  userId: Types.ObjectId;
  ticker: string;
  /** Ursprüngliche These des Users (Freitext) */
  thesis: string;
  /** Exit-Kriterien, Stop-Loss, Targets */
  exitCriteria?: string;
  /** Erwarteter Halteraum in Monaten (informativ) */
  expectedHorizonMonths?: number;
  /** Kurs zum Zeitpunkt der These */
  priceAtEntry?: number;
  currency?: string;
  /** KI-Auswertung */
  lastCheckStatus?: ThesisStatus;
  lastCheckVerdict?: string;
  lastCheckReasoning?: string;
  lastCheckSupporting?: string[];
  lastCheckContradicting?: string[];
  lastCheckRecommendation?: string;
  lastCheckModel?: string;
  lastCheckAt?: Date;
  /** Manuell durch User geschlossen */
  status: ThesisStatus;
  closedAt?: Date;
  closedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ThesisSchema = new Schema<IInvestmentThesis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    thesis: { type: String, required: true, trim: true, maxlength: 4000 },
    exitCriteria: { type: String, trim: true, maxlength: 2000 },
    expectedHorizonMonths: { type: Number },
    priceAtEntry: { type: Number },
    currency: { type: String, uppercase: true },
    lastCheckStatus: {
      type: String,
      enum: ["ACTIVE", "ON_TRACK", "AT_RISK", "BROKEN", "CLOSED"],
    },
    lastCheckVerdict: { type: String },
    lastCheckReasoning: { type: String },
    lastCheckSupporting: [String],
    lastCheckContradicting: [String],
    lastCheckRecommendation: { type: String },
    lastCheckModel: { type: String },
    lastCheckAt: { type: Date },
    status: {
      type: String,
      enum: ["ACTIVE", "ON_TRACK", "AT_RISK", "BROKEN", "CLOSED"],
      required: true,
      default: "ACTIVE",
    },
    closedAt: { type: Date },
    closedReason: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

ThesisSchema.index({ userId: 1, ticker: 1, status: 1 });

export const InvestmentThesis: Model<IInvestmentThesis> =
  mongoose.models.InvestmentThesis ||
  mongoose.model<IInvestmentThesis>("InvestmentThesis", ThesisSchema);
