import mongoose, { Schema, Model, Types } from "mongoose";

export type TransactionType = "buy" | "sell" | "dividend" | "fee";

export interface ITransaction {
  userId: Types.ObjectId;
  ticker: string;
  type: TransactionType;
  shares: number;
  price: number;
  amount?: number;
  currency: string;
  fees: number;
  date: Date;
  notes?: string;
  externalRef?: string;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    type: { type: String, required: true, enum: ["buy", "sell", "dividend", "fee"], index: true },
    shares: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    amount: { type: Number },
    currency: { type: String, required: true, uppercase: true, default: "EUR" },
    fees: { type: Number, default: 0 },
    date: { type: Date, required: true, index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    externalRef: { type: String, trim: true, sparse: true, index: true },
    source: { type: String, trim: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ userId: 1, ticker: 1, date: 1 });
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, externalRef: 1 }, { sparse: true });

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", TransactionSchema);
