import mongoose, { Schema, Model, Types } from "mongoose";

export interface IStockNote {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  ticker: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StockNoteSchema = new Schema<IStockNote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

StockNoteSchema.index({ userId: 1, ticker: 1, createdAt: -1 });

export const StockNote: Model<IStockNote> =
  (mongoose.models.StockNote as Model<IStockNote>) ||
  mongoose.model<IStockNote>("StockNote", StockNoteSchema);
