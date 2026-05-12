import mongoose, { Schema, Model } from "mongoose";

export type RelationshipType =
  | "customer"
  | "supplier"
  | "partner"
  | "competitor"
  | "investor"
  | "subsidiary";

export type RelationshipStrength = "strong" | "medium" | "weak";

export interface IRelationship {
  ticker?: string | null;
  name: string;
  type: RelationshipType;
  description: string;
  strength: RelationshipStrength;
}

export interface IRelationshipMap {
  ticker: string;
  name: string;
  summary: string;
  relationships: IRelationship[];
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

const RelationshipSchema = new Schema<IRelationship>(
  {
    ticker: { type: String, default: null },
    name: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ["customer", "supplier", "partner", "competitor", "investor", "subsidiary"],
    },
    description: { type: String, required: true },
    strength: { type: String, required: true, enum: ["strong", "medium", "weak"] },
  },
  { _id: false }
);

const RelationshipMapSchema = new Schema<IRelationshipMap>(
  {
    ticker: { type: String, required: true, uppercase: true, unique: true, index: true },
    name: { type: String, required: true },
    summary: { type: String, required: true },
    relationships: { type: [RelationshipSchema], default: [] },
    model: { type: String, required: true },
  },
  { timestamps: true }
);

export const RelationshipMap: Model<IRelationshipMap> =
  mongoose.models.RelationshipMap ||
  mongoose.model<IRelationshipMap>("RelationshipMap", RelationshipMapSchema);
