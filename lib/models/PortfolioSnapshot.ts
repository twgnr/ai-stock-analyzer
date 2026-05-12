import mongoose, { Schema, Model, Types } from "mongoose";

export interface IPortfolioSnapshot {
  userId: Types.ObjectId;
  date: Date;
  baseCurrency: string;
  totalValueBase: number;
  totalCostBase: number;
  positionCount: number;
  realizedGainYTD?: number;
  createdAt: Date;
}

const PortfolioSnapshotSchema = new Schema<IPortfolioSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    baseCurrency: { type: String, required: true, default: "EUR" },
    totalValueBase: { type: Number, required: true },
    totalCostBase: { type: Number, required: true },
    positionCount: { type: Number, default: 0 },
    realizedGainYTD: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PortfolioSnapshotSchema.index({ userId: 1, date: -1 }, { unique: true });

export const PortfolioSnapshot: Model<IPortfolioSnapshot> =
  mongoose.models.PortfolioSnapshot ||
  mongoose.model<IPortfolioSnapshot>("PortfolioSnapshot", PortfolioSnapshotSchema);
