import mongoose, { Schema, Model } from "mongoose";

export type Recommendation = "BUY" | "HOLD" | "SELL" | "REDUCE" | "ACCUMULATE";

export interface IAnalysis {
  ticker: string;
  kind: "single" | "portfolio" | "market";
  recommendation?: Recommendation;
  confidence?: number;
  summary: string;
  reasoning: string;
  risks: string[];
  opportunities: string[];
  priceTargets?: { low?: number; base?: number; high?: number };
  suggestedAllocation?: string;
  sourcesUsed: string[];
  model: string;
  createdAt: Date;
}

const AnalysisSchema = new Schema<IAnalysis>(
  {
    ticker: { type: String, required: true, uppercase: true, index: true },
    kind: { type: String, required: true, enum: ["single", "portfolio", "market"] },
    recommendation: { type: String, enum: ["BUY", "HOLD", "SELL", "REDUCE", "ACCUMULATE"] },
    confidence: { type: Number, min: 0, max: 1 },
    summary: { type: String, required: true },
    reasoning: { type: String, required: true },
    risks: [String],
    opportunities: [String],
    priceTargets: {
      low: Number,
      base: Number,
      high: Number,
    },
    suggestedAllocation: String,
    sourcesUsed: [String],
    model: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnalysisSchema.index({ ticker: 1, createdAt: -1 });

export const Analysis: Model<IAnalysis> =
  mongoose.models.Analysis || mongoose.model<IAnalysis>("Analysis", AnalysisSchema);
