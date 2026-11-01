import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * 9 Wicket money ledger — one per player.
 *
 * 9 Wicket is a transfer wallet: opening the game sends the player's whole
 * (whole-taka) balance to 9 Wicket (`totalTransferred`); what is left there
 * comes back to the main balance via `getbalance` (`totalReturned`).
 * `exposureBalance` = money held in open bets, changed only by callbacks.
 */
const nineWicketWalletSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    totalTransferred: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalReturned: {
      type: Number,
      default: 0,
      min: 0,
    },

    exposureBalance: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    lastTransferAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastReturnedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastTransferAt: {
      type: Date,
      default: null,
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["idle", "playing", "exposure", "settled"],
      default: "idle",
      index: true,
    },
  },
  { timestamps: true },
);

nineWicketWalletSchema.index({ status: 1, exposureBalance: -1 });

const NineWicketWallet =
  mongoose.models.NineWicketWallet || mongoose.model("NineWicketWallet", nineWicketWalletSchema);

export default NineWicketWallet;
