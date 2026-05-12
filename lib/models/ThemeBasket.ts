import mongoose, { Schema, Model, Types } from "mongoose";

export type ThemeBucket = "big" | "mid" | "small";

export interface IThemeTicker {
  ticker: string;
  name: string;
  /** Marktkapitalisierung in USD zum Zeitpunkt der Generierung. */
  marketCapUsd: number;
  /** Heimatwährung der Aktie (Yahoo `currency`). */
  currency: string;
  /** 1-Satz-Begründung der KI, warum die Aktie ins Thema passt. */
  rationale: string;
}

export interface IThemeBasket {
  _id: Types.ObjectId;
  /** null = globaler Default-Basket (vom Admin gepflegt, für alle sichtbar). */
  userId: Types.ObjectId | null;
  name: string;
  description: string;
  bigPlayers: IThemeTicker[];
  midPlayers: IThemeTicker[];
  smallPlayers: IThemeTicker[];
  generatedAt: Date;
  generationModel: string;
  /** USD-Kosten der KI-Generierung — fürs Admin-Reporting nice-to-have. */
  generationCostUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

const TickerSchema = new Schema<IThemeTicker>(
  {
    ticker: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    marketCapUsd: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    rationale: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const ThemeBasketSchema = new Schema<IThemeBasket>(
  {
    // Optional: bei Default-Baskets bleibt das Feld null. Sparse-Index, damit
    // Mehrfach-`null` keinen Unique-Konflikt auslöst.
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 600 },
    bigPlayers: { type: [TickerSchema], default: [] },
    midPlayers: { type: [TickerSchema], default: [] },
    smallPlayers: { type: [TickerSchema], default: [] },
    generatedAt: { type: Date, required: true },
    generationModel: { type: String, default: "" },
    generationCostUsd: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Pro Scope (User oder global) muss der Themen-Name eindeutig sein. `null` als
// userId-Wert wird durch `partialFilterExpression` korrekt abgedeckt.
ThemeBasketSchema.index({ userId: 1, name: 1 }, { unique: true });

export const ThemeBasket: Model<IThemeBasket> =
  (mongoose.models.ThemeBasket as Model<IThemeBasket>) ||
  mongoose.model<IThemeBasket>("ThemeBasket", ThemeBasketSchema);
