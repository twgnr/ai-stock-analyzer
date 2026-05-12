import mongoose, { Schema, Model, Types } from "mongoose";

/**
 * Web-Push-Subscription pro Browser/Gerät. Ein User kann mehrere haben
 * (Desktop + Handy + Tablet). Endpoint ist der Primärschlüssel —
 * gleiche Endpoints werden upserted (z. B. nach Re-Subscribe).
 */
export interface IPushSubscription {
  userId: Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

export const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
