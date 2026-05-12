import mongoose, { Schema, Model, Types } from "mongoose";

export interface IPosition {
  userId: Types.ObjectId;
  ticker: string;
  name?: string;
  shares: number;
  avgPrice: number;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PositionSchema = new Schema<IPosition>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, trim: true },
    shares: { type: Number, required: true, min: 0 },
    avgPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "EUR", uppercase: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

PositionSchema.index({ userId: 1, ticker: 1 }, { unique: true });

export const Position: Model<IPosition> =
  mongoose.models.Position || mongoose.model<IPosition>("Position", PositionSchema);
