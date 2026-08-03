import mongoose from "mongoose";

const TextBiSchema = new mongoose.Schema(
  {
    bn: { type: String, default: "", trim: true },
    en: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const ChannelSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },

    name: {
      type: TextBiSchema,
      default: () => ({}),
    },

    tagText: {
      type: String,
      default: "+0%",
      trim: true,
    },

    bonusTitle: {
      type: TextBiSchema,
      default: () => ({}),
    },

    bonusPercent: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const PromotionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: TextBiSchema,
      default: () => ({}),
    },

    bonusType: {
      type: String,
      enum: ["percent", "fixed"],
      default: "fixed",
    },

    bonusValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    turnoverMultiplier: {
      type: Number,
      default: 1,
      min: 0,
    },

    bonusScope: {
      type: String,
      enum: ["first-deposit", "all-time"],
      default: "all-time",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sort: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const DepositBonusTurnoverSchema = new mongoose.Schema(
  {
    depositMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DepositMethod",
      required: true,
      unique: true,
    },

    turnoverMultiplier: {
      type: Number,
      default: 1,
      min: 0,
    },

    channels: {
      type: [ChannelSchema],
      default: [],
    },

    promotions: {
      type: [PromotionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

DepositBonusTurnoverSchema.index({ "promotions.isActive": 1 });
DepositBonusTurnoverSchema.index({ "promotions.bonusScope": 1 });

const DepositBonusTurnover =
  mongoose.models.DepositBonusTurnover ||
  mongoose.model("DepositBonusTurnover", DepositBonusTurnoverSchema);

export default DepositBonusTurnover;
