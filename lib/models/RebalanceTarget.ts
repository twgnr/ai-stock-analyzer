import mongoose, { Schema, Model, Types } from "mongoose";

export interface IRebalanceBucket {
  label: string;
  targetWeight: number;
  tickers: string[];
}

export interface IRebalanceTarget {
  userId: Types.ObjectId;
  buckets: IRebalanceBucket[];
  thresholdPct: number;
  updatedAt: Date;
  createdAt: Date;
}

const BucketSchema = new Schema<IRebalanceBucket>(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    targetWeight: { type: Number, required: true, min: 0, max: 100 },
    tickers: [{ type: String, uppercase: true, trim: true }],
  },
  { _id: false }
);

const RebalanceTargetSchema = new Schema<IRebalanceTarget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    buckets: { type: [BucketSchema], default: [] },
    thresholdPct: { type: Number, default: 5, min: 0, max: 50 },
  },
  { timestamps: true }
);

export const RebalanceTarget: Model<IRebalanceTarget> =
  mongoose.models.RebalanceTarget ||
  mongoose.model<IRebalanceTarget>("RebalanceTarget", RebalanceTargetSchema);
