import mongoose from "mongoose";

const { Schema } = mongoose;

const LangTextSchema = new Schema(
  {
    bn: { type: String, default: "", trim: true },
    en: { type: String, default: "", trim: true },
  },
  { _id: false },
);

export const NINE_WICKET_DEFAULT_UID = "48341a3bf62b6dd0814d7129e7e0834b";
export const NINE_WICKET_CODE = "9W";
const ORACLE_BASE = "https://oraclegames.net/api/ninewicket";

/**
 * 9 Wicket — switched on/off, named and pictured from admin. Always a single
 * document.
 *
 * The game is not in the site's own game list, so the server adds it to the
 * Sports row itself (globalGameClientRoutes) while it is on. Oracle's key is
 * the same launch key the other games use (`x-oracle-key`).
 */
const nineWicketSettingSchema = new Schema(
  {
    key: { type: String, default: "main", unique: true },
    active: { type: Boolean, default: false },
    /**
     * Bring money left in 9 Wicket back on a balance refresh
     * (/api/user-info/balance). It calls Oracle, so a refresh takes a little
     * longer — can be turned off; money then comes back from admin's
     * "Return now" or the next time the game is opened.
     */
    autoReturn: { type: Boolean, default: true },
    gameUId: { type: String, default: NINE_WICKET_DEFAULT_UID, trim: true },
    name: { type: LangTextSchema, default: () => ({ bn: "৯ উইকেট", en: "9 Wicket" }) },
    /** Card image — `/uploads/...` or a full URL */
    image: { type: String, default: "/uploads/nine-wicket.png", trim: true },
    /** Kept for compatibility — Bajiman shows it in the Sports row */
    categoryKey: { type: String, default: "sports", trim: true, lowercase: true },
    /** Position among the Sports cards (0 = first) */
    position: { type: Number, default: 0, min: 0 },
    /** Send the balance and open the game */
    transferUrl: { type: String, default: ORACLE_BASE, trim: true },
    /** Bring back what is left in 9 Wicket */
    balanceUrl: { type: String, default: `${ORACLE_BASE}/getbalance`, trim: true },
    lastError: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

nineWicketSettingSchema.statics.current = async function current() {
  return this.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

const NineWicketSetting =
  mongoose.models.NineWicketSetting || mongoose.model("NineWicketSetting", nineWicketSettingSchema);

export default NineWicketSetting;
