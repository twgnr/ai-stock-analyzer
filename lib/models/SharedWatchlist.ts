import mongoose, { Schema, Model, Types } from "mongoose";

export interface ISharedWatchlistItem {
  ticker: string;
  name?: string;
  notes?: string;
}

export interface ISharedWatchlist {
  userId: Types.ObjectId;
  uploaderEmail: string;
  uploaderName?: string;
  title: string;
  description?: string;
  tickers: ISharedWatchlistItem[];
  isPublic: boolean;
  importCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<ISharedWatchlistItem>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

const SharedWatchlistSchema = new Schema<ISharedWatchlist>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    uploaderEmail: { type: String, required: true },
    uploaderName: { type: String },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    tickers: { type: [ItemSchema], default: [] },
    isPublic: { type: Boolean, default: false, index: true },
    importCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SharedWatchlistSchema.index({ isPublic: 1, createdAt: -1 });

export const SharedWatchlist: Model<ISharedWatchlist> =
  mongoose.models.SharedWatchlist ||
  mongoose.model<ISharedWatchlist>("SharedWatchlist", SharedWatchlistSchema);
