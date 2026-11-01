import mongoose from "mongoose";

const { Schema } = mongoose;

const LangTextSchema = new Schema(
  {
    bn: { type: String, default: "", trim: true },
    en: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const EligibleProviderSchema = new Schema(
  {
    providerCode: { type: String, required: true, trim: true, uppercase: true },
    percent: { type: Number, default: 100, min: 0, max: 100 },
  },
  { _id: false },
);

/** A selectable bonus — same shape as the auto deposit bonuses */
const BonusSchema = new Schema(
  {
    title: { type: LangTextSchema, default: () => ({}) },
    bonusType: { type: String, enum: ["fixed", "percent"], default: "fixed" },
    bonusValue: { type: Number, default: 0, min: 0 },
    turnoverMultiplier: { type: Number, default: 1, min: 0 },
    bonusScope: { type: String, enum: ["all-time", "first-deposit"], default: "all-time" },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0, min: 0 },
    eligibleProviders: { type: [EligibleProviderSchema], default: [] },
  },
  { _id: true },
);

/**
 * A payment method — MFSWallet only accepts these four (bkash, nagad, rocket,
 * upay). The player picks it on our side, the gateway API needs `method`.
 */
const MethodSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, lowercase: true, enum: ["bkash", "nagad", "rocket", "upay"] },
    name: { type: LangTextSchema, default: () => ({}) },
    logoUrl: { type: String, default: "", trim: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0, min: 0 },
    minAmount: { type: Number, default: 0, min: 0 },
    maxAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

export const MFS_METHODS = ["bkash", "nagad", "rocket", "upay"];

const DEFAULT_METHODS = [
  { code: "bkash", name: { bn: "বিকাশ", en: "bKash" }, order: 1 },
  { code: "nagad", name: { bn: "নগদ", en: "Nagad" }, order: 2 },
  { code: "rocket", name: { bn: "রকেট", en: "Rocket" }, order: 3 },
  { code: "upay", name: { bn: "উপায়", en: "Upay" }, order: 4 },
];

export const MFS_DEFAULT_URL = "https://api.mfswallet.com/api/gateway/create-link";

/**
 * MFSWallet (Personal Auto Deposit) settings — always a single document.
 *
 * SIM based gateway: money lands on our own bKash/Nagad/... numbers, the
 * MFSWallet Android app reads the SMS and sends a webhook. The API key is set
 * from the admin panel, never in code or .env.
 */
const mfsSettingSchema = new Schema(
  {
    key: { type: String, default: "main", unique: true },
    apiKey: { type: String, default: "", trim: true, select: false },
    active: { type: Boolean, default: false },
    /** The gateway's "create-link" URL — changeable from admin */
    apiUrl: { type: String, default: MFS_DEFAULT_URL, trim: true },
    /** Name shown to players */
    displayName: {
      type: LangTextSchema,
      default: () => ({ bn: "পার্সোনাল অটো ডিপোজিট", en: "Personal Auto Deposit" }),
    },
    minAmount: { type: Number, default: 100, min: 1 },
    maxAmount: { type: Number, default: 25000, min: 0 },
    methods: { type: [MethodSchema], default: () => DEFAULT_METHODS },
    bonuses: { type: [BonusSchema], default: [] },
    lastError: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

mfsSettingSchema.statics.current = async function current() {
  const doc = await this.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).select("+apiKey");
  if (!doc.methods || doc.methods.length === 0) {
    doc.methods = DEFAULT_METHODS;
    await doc.save();
  }
  return doc;
};

/** Shape sent to admin — the key itself never leaves the server */
mfsSettingSchema.methods.toSafeJSON = function toSafeJSON() {
  const key = String(this.apiKey || "");
  return {
    keyPreview: key ? `••••••••${key.slice(-4)}` : "",
    hasKey: Boolean(key),
    active: this.active,
    apiUrl: this.apiUrl,
    displayName: this.displayName,
    minAmount: this.minAmount,
    maxAmount: this.maxAmount,
    methods: this.methods,
    bonuses: this.bonuses,
    lastError: this.lastError,
    updatedAt: this.updatedAt,
  };
};

const MfsSetting = mongoose.models.MfsSetting || mongoose.model("MfsSetting", mfsSettingSchema);
export default MfsSetting;
