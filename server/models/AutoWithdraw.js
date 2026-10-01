import mongoose from "mongoose";

const { Schema } = mongoose;

const AutoWithdrawSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userIdentity: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: ["bkash", "nagad", "rocket", "upay"],
      required: true,
    },

    methodName: {
      bn: { type: String, default: "", trim: true },
      en: { type: String, default: "", trim: true },
    },

    wallet: {
      type: Schema.Types.ObjectId,
      ref: "EWallet",
      required: true,
    },

    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },

    withdrawalId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    feePercentage: {
      type: Number,
      default: 0,
      min: 0,
    },

    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    deductedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    proofImages: {
      type: [String],
      default: [],
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    // Guards against a REJECTED webhook that arrives more than once (or a
    // manual admin reject after the gateway already rejected) from refunding
    // the user's balance twice.
    refunded: {
      type: Boolean,
      default: false,
    },

    balanceBefore: {
      type: Number,
      default: 0,
    },

    balanceAfter: {
      type: Number,
      default: 0,
    },

    // Per-transaction webhook secret, embedded in the callback_url sent to
    // the gateway — OraclePay's webhook carries no signature of its own, so
    // this is the only proof a webhook call actually came from the gateway
    // for this specific transaction. Hidden by default from normal queries.
    callbackKey: {
      type: String,
      select: false,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    reviewNote: {
      type: String,
      default: "",
      trim: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

AutoWithdrawSchema.index({ user: 1, createdAt: -1 });
AutoWithdrawSchema.index({ status: 1, createdAt: -1 });

const AutoWithdraw =
  mongoose.models.AutoWithdraw ||
  mongoose.model("AutoWithdraw", AutoWithdrawSchema);

export default AutoWithdraw;
