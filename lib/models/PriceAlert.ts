import mongoose, { Schema, Model, Types } from "mongoose";

export type AlertDirection = "above" | "below";

export type AlertType = "price" | "indicator";

export type IndicatorCondition =
  | "rsi_below_30"
  | "rsi_above_70"
  | "macd_bullish_cross"
  | "macd_bearish_cross"
  | "sma_golden_cross"
  | "sma_death_cross"
  | "bb_breakout_upper"
  | "bb_breakout_lower"
  | "price_above_sma200"
  | "price_below_sma200";

export interface IPriceAlert {
  userId: Types.ObjectId;
  ticker: string;
  type: AlertType;
  direction?: AlertDirection;
  threshold?: number;
  currency?: string;
  indicatorCondition?: IndicatorCondition;
  active: boolean;
  triggeredAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PriceAlertSchema = new Schema<IPriceAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ticker: { type: String, required: true, uppercase: true, trim: true, index: true },
    type: {
      type: String,
      enum: ["price", "indicator"],
      required: true,
      default: "price",
    },
    direction: { type: String, enum: ["above", "below"] },
    threshold: { type: Number },
    currency: { type: String, uppercase: true },
    indicatorCondition: {
      type: String,
      enum: [
        "rsi_below_30",
        "rsi_above_70",
        "macd_bullish_cross",
        "macd_bearish_cross",
        "sma_golden_cross",
        "sma_death_cross",
        "bb_breakout_upper",
        "bb_breakout_lower",
        "price_above_sma200",
        "price_below_sma200",
      ],
    },
    active: { type: Boolean, default: true, index: true },
    triggeredAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

PriceAlertSchema.index({ userId: 1, active: 1 });

export const PriceAlert: Model<IPriceAlert> =
  mongoose.models.PriceAlert || mongoose.model<IPriceAlert>("PriceAlert", PriceAlertSchema);
