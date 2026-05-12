import mongoose, { Schema, Model, Types } from "mongoose";

export interface IEmailVerificationToken {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const EmailVerificationTokenSchema = new Schema<IEmailVerificationToken>(
  {
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

EmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken: Model<IEmailVerificationToken> =
  mongoose.models.EmailVerificationToken ||
  mongoose.model<IEmailVerificationToken>(
    "EmailVerificationToken",
    EmailVerificationTokenSchema
  );
