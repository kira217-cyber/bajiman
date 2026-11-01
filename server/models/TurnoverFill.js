import mongoose from "mongoose";

/*
 * Admin turnover fill-up history.
 *
 * An admin can fill a player's running turnover by hand (the condition is
 * met without play, so withdrawal opens). Every fill is one row here: who,
 * whose, which turnovers, how far they were and how much was filled — so the
 * numbers can be checked later. Rows are never edited or deleted.
 */
const filledItemSchema = new mongoose.Schema(
  {
    turnover: { type: mongoose.Schema.Types.ObjectId, ref: "TurnOver", required: true },
    sourceType: { type: String, default: "" },
    required: { type: Number, default: 0 },
    progressBefore: { type: Number, default: 0 },
    // required − progressBefore — the part filled without play
    filled: { type: Number, default: 0 },
  },
  { _id: false },
);

const turnoverFillSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userIdText: { type: String, default: "", index: true },

    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    adminEmail: { type: String, default: "" },

    items: { type: [filledItemSchema], default: [] },
    count: { type: Number, default: 0 },
    totalFilled: { type: Number, default: 0 },

    note: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

turnoverFillSchema.index({ createdAt: -1 });

const TurnoverFill =
  mongoose.models.TurnoverFill || mongoose.model("TurnoverFill", turnoverFillSchema);

export default TurnoverFill;
