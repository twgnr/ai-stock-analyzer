import mongoose, { Schema, Model, Types } from "mongoose";

export interface IRealizedGain {
  userId: Types.ObjectId;
  ticker: string;
  shares: number;
  avgBuyPrice: number;
  sellPrice: number;
  currency: string;
  gainBase: number;
  baseCurrency: string;
  fxRate: number;
  saleDate: Date;
  transactionId: Types.ObjectId;
  createdAt: Date;
}

const RealizedGainSchema = new Schema<IRealizedGain>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, index: true },
    shares: { type: Number, required: true },
    avgBuyPrice: { type: Number, required: true },
    sellPrice: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    gainBase: { type: Number, required: true },
    baseCurrency: { type: String, required: true, default: "EUR" },
    fxRate: { type: Number, required: true, default: 1 },
    saleDate: { type: Date, required: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

RealizedGainSchema.index({ userId: 1, saleDate: -1 });

export const RealizedGain: Model<IRealizedGain> =
  mongoose.models.RealizedGain ||
  mongoose.model<IRealizedGain>("RealizedGain", RealizedGainSchema);
