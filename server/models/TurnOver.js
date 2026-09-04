import mongoose from "mongoose";

const TurnOverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sourceType: {
      type: String,
      enum: [
        "deposit",
        "auto-deposit",
        "auto-personal-deposit",
        "register-bonus",
        "admin-manual-deposit",
        "redeem",
      ],
      required: true,
      index: true,
    },

    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    required: {
      type: Number,
      required: true,
      min: 0,
    },

    progress: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["running", "completed"],
      default: "running",
      index: true,
    },

    creditedAmount: {
      type: Number,
      default: 0,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // How much of `progress` has been contributed specifically by each
    // eligible provider's dedicated quota (TurnoverProviderSetting), so a
    // provider's mandatory minimum share can be tracked and capped
    // per-card. Progress beyond what's listed here came from the shared
    // "any provider" pool. Only populated once provider-gated turnover is
    // configured — empty for unrestricted turnovers.
    providerProgress: [
      {
        _id: false,
        providerCode: { type: String, required: true, uppercase: true, trim: true },
        progress: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  { timestamps: true },
);

TurnOverSchema.index({ user: 1, sourceType: 1, sourceId: 1 }, { unique: true });

TurnOverSchema.index({ user: 1, status: 1 });
TurnOverSchema.index({ createdAt: -1 });

const TurnOver =
  mongoose.models.TurnOver || mongoose.model("TurnOver", TurnOverSchema);

export default TurnOver;
