import mongoose, { Schema, Model, Types } from "mongoose";

export type MagazineRec =
  | "BUY"
  | "HOLD"
  | "SELL"
  | "ACCUMULATE"
  | "REDUCE"
  | "WATCH";

export interface IMagazinePriceTarget {
  value: number;
  currency: string;
}

export interface IMagazineRecommendation {
  ticker?: string | null;
  name: string;
  recommendation: MagazineRec;
  priceTarget?: IMagazinePriceTarget | null;
  stopLoss?: IMagazinePriceTarget | null;
  horizon?: "kurz" | "mittel" | "lang" | null;
  rationale: string;
  pageReference?: string | null;
  risks?: string[];
}

export interface IMagazineAnalysis {
  userId: Types.ObjectId;
  uploaderEmail: string;
  uploaderName?: string;
  originalFilename?: string;
  magazineTitle: string;
  // Freier Titel des Users. Hat in der UI Vorrang vor magazineTitle.
  customTitle?: string | null;
  issueNumber?: string | null;
  issueDate?: string | null;
  summary: string;
  coverTopics: string[];
  marketOutlook?: string | null;
  recommendations: IMagazineRecommendation[];
  isPublic: boolean;
  provider?: string;
  // Format: "provider:model".
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

const PriceTargetSchema = new Schema<IMagazinePriceTarget>(
  {
    value: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
  },
  { _id: false }
);

const RecommendationSchema = new Schema<IMagazineRecommendation>(
  {
    ticker: { type: String, trim: true, uppercase: true, default: null },
    name: { type: String, required: true, trim: true },
    recommendation: {
      type: String,
      enum: ["BUY", "HOLD", "SELL", "ACCUMULATE", "REDUCE", "WATCH"],
      required: true,
    },
    priceTarget: { type: PriceTargetSchema, default: null },
    stopLoss: { type: PriceTargetSchema, default: null },
    horizon: {
      type: String,
      enum: ["kurz", "mittel", "lang", null],
      default: null,
    },
    rationale: { type: String, required: true },
    pageReference: { type: String, default: null },
    risks: [{ type: String }],
  },
  { _id: false }
);

const MagazineAnalysisSchema = new Schema<IMagazineAnalysis>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    uploaderEmail: { type: String, required: true },
    uploaderName: { type: String },
    originalFilename: { type: String },
    magazineTitle: { type: String, required: true, trim: true },
    customTitle: { type: String, default: null, trim: true },
    issueNumber: { type: String, default: null },
    issueDate: { type: String, default: null },
    summary: { type: String, default: "" },
    coverTopics: [{ type: String }],
    marketOutlook: { type: String, default: null },
    recommendations: { type: [RecommendationSchema], default: [] },
    isPublic: { type: Boolean, default: false, index: true },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
  },
  { timestamps: true }
);

MagazineAnalysisSchema.index({ isPublic: 1, createdAt: -1 });

export const MagazineAnalysis: Model<IMagazineAnalysis> =
  mongoose.models.MagazineAnalysis ||
  mongoose.model<IMagazineAnalysis>("MagazineAnalysis", MagazineAnalysisSchema);
