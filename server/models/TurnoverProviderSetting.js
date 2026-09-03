import mongoose from "mongoose";

const { Schema } = mongoose;

const EligibleProviderSchema = new Schema(
  {
    providerCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },

    // What % of a wager on this provider counts toward turnover. 100 =
    // full amount, 50 = half, etc.
    percent: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
  },
  { _id: false },
);

// Singleton: which game providers' wagers count toward turnover fulfillment,
// and at what percentage. Keyed by providerCode (not a local ObjectId)
// since the admin picks providers from the live master API list (see
// gameApiKeyRoutes.js /admin/providers) — providerCode is the one
// identifier stable across both that live list and our locally-synced
// GameProvider records.
// Empty list = no restriction (every provider counts at 100%) so existing
// behavior is unchanged until an admin actually configures this.
const TurnoverProviderSettingSchema = new mongoose.Schema(
  {
    eligibleProviders: [EligibleProviderSchema],
  },
  { timestamps: true },
);

const TurnoverProviderSetting =
  mongoose.models.TurnoverProviderSetting ||
  mongoose.model("TurnoverProviderSetting", TurnoverProviderSettingSchema);

export default TurnoverProviderSetting;
