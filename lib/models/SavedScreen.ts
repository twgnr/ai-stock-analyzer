import mongoose, { Schema, Model, Types } from "mongoose";

export interface ISavedScreen {
  userId: Types.ObjectId;
  name: string;
  filters: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SavedScreenSchema = new Schema<ISavedScreen>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    filters: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

SavedScreenSchema.index({ userId: 1, name: 1 }, { unique: true });

export const SavedScreen: Model<ISavedScreen> =
  mongoose.models.SavedScreen || mongoose.model<ISavedScreen>("SavedScreen", SavedScreenSchema);
