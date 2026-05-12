import mongoose, { Schema, Model, Types } from "mongoose";

export interface IWatchlistItem {
  userId: Types.ObjectId;
  ticker: string;
  name?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WatchlistSchema = new Schema<IWatchlistItem>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

WatchlistSchema.index({ userId: 1, ticker: 1 }, { unique: true });

export const Watchlist: Model<IWatchlistItem> =
  mongoose.models.Watchlist || mongoose.model<IWatchlistItem>("Watchlist", WatchlistSchema);
