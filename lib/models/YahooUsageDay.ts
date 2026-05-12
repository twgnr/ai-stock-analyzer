import mongoose, { Schema, Model } from "mongoose";

/**
 * Zähler für Yahoo-Finance-Requests pro Kalendertag (UTC).
 * Jeder Eintrag entspricht einem Tag; `count` wird atomar via `$inc` erhöht.
 */
export interface IYahooUsageDay {
  /** ISO-Datum YYYY-MM-DD in UTC */
  date: string;
  count: number;
  lastLimitHitAt?: Date;
  updatedAt: Date;
  createdAt: Date;
}

const YahooUsageDaySchema = new Schema<IYahooUsageDay>(
  {
    date: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, default: 0, min: 0 },
    lastLimitHitAt: { type: Date },
  },
  { timestamps: true }
);

export const YahooUsageDay: Model<IYahooUsageDay> =
  (mongoose.models.YahooUsageDay as Model<IYahooUsageDay>) ||
  mongoose.model<IYahooUsageDay>("YahooUsageDay", YahooUsageDaySchema);
