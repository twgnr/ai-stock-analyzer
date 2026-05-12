import mongoose, { Schema, Model, Types } from "mongoose";

export interface IUsageLog {
  userId: Types.ObjectId;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  estimatedCostUSD: number;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

const UsageLogSchema = new Schema<IUsageLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    operation: { type: String, required: true, index: true },
    model: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheCreationTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    estimatedCostUSD: { type: Number, default: 0 },
    success: { type: Boolean, default: true },
    errorMessage: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UsageLogSchema.index({ userId: 1, createdAt: -1 });

export const UsageLog: Model<IUsageLog> =
  mongoose.models.UsageLog || mongoose.model<IUsageLog>("UsageLog", UsageLogSchema);
