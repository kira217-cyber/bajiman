import mongoose from "mongoose";

const { Schema } = mongoose;

const I18nSchema = new Schema(
  {
    bn: { type: String, default: "", trim: true },
    en: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const MethodSchema = new Schema(
  {
    code: {
      type: String,
      enum: ["bkash", "nagad", "rocket", "upay"],
      required: true,
    },

    name: {
      type: I18nSchema,
      default: () => ({ bn: "", en: "" }),
    },

    logoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    order: {
      type: Number,
      default: 0,
      min: 0,
    },

    minimumWithdrawAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maximumWithdrawAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const DEFAULT_METHODS = [
  { code: "bkash", name: { bn: "বিকাশ", en: "bKash" }, order: 0 },
  { code: "nagad", name: { bn: "নগদ", en: "Nagad" }, order: 1 },
  { code: "rocket", name: { bn: "রকেট", en: "Rocket" }, order: 2 },
  { code: "upay", name: { bn: "উপায়", en: "Upay" }, order: 3 },
];

const AutoWithdrawSettingSchema = new Schema(
  {
    // Fixed, unique value so findOneAndUpdate(..., {upsert:true}) on this
    // field is race-safe for the very first call against an empty
    // collection — an empty-filter upsert isn't, since {} has no backing
    // unique index to make Mongo's upsert atomic.
    key: {
      type: String,
      default: "main",
      unique: true,
    },

    businessToken: {
      type: String,
      default: "",
      trim: true,
    },

    active: {
      type: Boolean,
      default: false,
    },

    minAmount: {
      type: Number,
      default: 500,
      min: 1,
    },

    maxAmount: {
      type: Number,
      default: 50000,
      min: 0,
    },

    methods: {
      type: [MethodSchema],
      default: () => DEFAULT_METHODS,
    },
  },
  { timestamps: true },
);

const AutoWithdrawSetting =
  mongoose.models.AutoWithdrawSetting ||
  mongoose.model("AutoWithdrawSetting", AutoWithdrawSettingSchema);

export { DEFAULT_METHODS };
export default AutoWithdrawSetting;
