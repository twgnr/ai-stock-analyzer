import mongoose, { Schema, Model, Types } from "mongoose";

export interface INewsDigestTicker {
  ticker: string;
  name?: string;
  relevance: number; // 1-5
  impact: "positive" | "negative" | "neutral";
  summary: string;
  keyFacts: string[];
  priceChangePct?: number;
}

export interface INewsDigest {
  userId: Types.ObjectId;
  periodDays: number;
  tickers: string[];
  headline: string;
  summary: string;
  marketOverview: string;
  perTicker: INewsDigestTicker[];
  upcomingEvents: string[];
  watchNext: string[];
  model: string;
  mailedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TickerSchema = new Schema<INewsDigestTicker>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    name: String,
    relevance: { type: Number, default: 1, min: 1, max: 5 },
    impact: {
      type: String,
      enum: ["positive", "negative", "neutral"],
      default: "neutral",
    },
    summary: { type: String, default: "" },
    keyFacts: [{ type: String }],
    priceChangePct: Number,
  },
  { _id: false }
);

const NewsDigestSchema = new Schema<INewsDigest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    periodDays: { type: Number, default: 7 },
    tickers: [{ type: String }],
    headline: { type: String, default: "" },
    summary: { type: String, default: "" },
    marketOverview: { type: String, default: "" },
    perTicker: { type: [TickerSchema], default: [] },
    upcomingEvents: [{ type: String }],
    watchNext: [{ type: String }],
    model: { type: String, default: "" },
    mailedAt: { type: Date },
  },
  { timestamps: true }
);

NewsDigestSchema.index({ userId: 1, createdAt: -1 });

export const NewsDigest: Model<INewsDigest> =
  mongoose.models.NewsDigest ||
  mongoose.model<INewsDigest>("NewsDigest", NewsDigestSchema);
