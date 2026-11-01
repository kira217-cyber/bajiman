import mongoose from "mongoose";

const { Schema } = mongoose;

const LangTextSchema = new Schema({ bn: { type: String, default: "", trim: true }, en: { type: String, default: "", trim: true } }, { _id: false });

const EligibleProviderSchema = new Schema(
  { providerCode: { type: String, trim: true, uppercase: true }, percent: { type: Number, default: 100, min: 0, max: 100 } },
  { _id: false },
);

const SelectedBonusSchema = new Schema(
  {
    bonusId: { type: String, default: "", trim: true },
    title: { type: LangTextSchema, default: () => ({}) },
    bonusType: { type: String, enum: ["fixed", "percent", ""], default: "" },
    bonusScope: { type: String, enum: ["all-time", "first-deposit", ""], default: "" },
    bonusValue: { type: Number, default: 0, min: 0 },
    bonusAmount: { type: Number, default: 0, min: 0 },
    turnoverMultiplier: { type: Number, default: 1, min: 0 },
    eligibleProviders: { type: [EligibleProviderSchema], default: [] },
  },
  { _id: false },
);

const CalcSchema = new Schema(
  {
    depositAmount: { type: Number, default: 0, min: 0 },
    bonusAmount: { type: Number, default: 0, min: 0 },
    creditedAmount: { type: Number, default: 0, min: 0 },
    turnoverMultiplier: { type: Number, default: 1, min: 0 },
    targetTurnover: { type: Number, default: 0, min: 0 },
    affiliateDepositCommission: {
      type: new Schema(
        {
          affiliatorId: { type: String, default: "", trim: true },
          affiliatorUserId: { type: String, default: "", trim: true },
          percent: { type: Number, default: 0, min: 0 },
          baseAmount: { type: Number, default: 0, min: 0 },
          commissionAmount: { type: Number, default: 0, min: 0 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { _id: false },
);

/**
 * One MFSWallet (Personal Auto Deposit) payment.
 *
 * Starts as PENDING, the gateway hands back a `short_code`. Webhooks:
 *   COMPLETED -> PAID, balance is credited (once only — `balanceAdded`)
 *   PENDING   -> `needsReview`: the gateway could not match it, admin confirms or rejects by hand
 *   FAILED    -> FAILED
 */
const mfsDepositSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userIdText: { type: String, default: "", trim: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, required: true, trim: true, lowercase: true },

    /** Our own number — shown in the player's records and the return URL */
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    /** The gateway's code — webhooks are matched by this */
    shortCode: { type: String, default: "", trim: true },

    status: { type: String, enum: ["PENDING", "PAID", "FAILED"], default: "PENDING", index: true },
    /** The gateway sent PENDING — needs an admin check */
    needsReview: { type: Boolean, default: false, index: true },

    transactionId: { type: String, default: "", trim: true },
    senderNumber: { type: String, default: "", trim: true },
    /** Gateway message — why it failed or is pending */
    gatewayMessage: { type: String, default: "", trim: true },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    reviewNote: { type: String, default: "", trim: true },

    /**
     * Per-payment secret embedded in the webhook URL. MFSWallet sends no
     * signature, so the URL itself is the proof — a wrong key is rejected.
     */
    callbackKey: { type: String, default: "", select: false },

    paidAt: { type: Date, default: null },
    balanceAdded: { type: Boolean, default: false, index: true },

    selectedBonus: { type: SelectedBonusSchema, default: () => ({}) },
    calc: { type: CalcSchema, default: () => ({}) },
  },
  { timestamps: true },
);

mfsDepositSchema.index({ shortCode: 1 }, { unique: true, partialFilterExpression: { shortCode: { $type: "string", $gt: "" } } });
mfsDepositSchema.index({ user: 1, createdAt: -1 });
mfsDepositSchema.index({ status: 1, createdAt: -1 });

const MfsDeposit = mongoose.models.MfsDeposit || mongoose.model("MfsDeposit", mfsDepositSchema);
export default MfsDeposit;
