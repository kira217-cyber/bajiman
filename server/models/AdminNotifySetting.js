import mongoose from "mongoose";

/*
 * Notification App (adminnoti.oraclesoft.online) — push to the site owner's
 * phone.
 *
 * On that system this site is one "Company" (name + phone + PIN); the owner
 * signs in to the APK with that phone and PIN. Events are sent to
 * /api/v1/notices/send. Which events go out, with which sound (priority) and
 * which admin page they open — all kept here. A single document.
 */
const eventSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    // important = loud ring, normal = normal sound, silent = no sound
    priority: { type: String, enum: ["important", "normal", "silent"], default: "normal" },
    // empty = admin URL + the event's own page
    url: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const adminNotifySettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },
    active: { type: Boolean, default: false },

    apiBase: { type: String, default: "https://noitapi.oraclesoft.online", trim: true },
    // x-api-key — write only, never sent back
    apiKey: { type: String, default: "", trim: true, select: false },

    // this site's Company there — the APK signs in with this phone + PIN
    companyId: { type: String, default: "", trim: true },
    companyName: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    pinCode: { type: String, default: "", trim: true },

    // root of the admin page a notification opens — e.g. https://admin.bajiman.com
    adminUrl: { type: String, default: "", trim: true },

    // event -> setting (defaults in utils/adminNotify.js)
    events: { type: Map, of: eventSchema, default: () => ({}) },

    sentCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    lastError: { type: String, default: "", trim: true },
    lastErrorAt: { type: Date, default: null },
  },
  { timestamps: true },
);

adminNotifySettingSchema.statics.current = async function current({ withKey = false } = {}) {
  const query = this.findOne({ key: "main" });
  if (withKey) query.select("+apiKey");
  const found = await query;
  if (found) return found;
  await this.updateOne({ key: "main" }, { $setOnInsert: { key: "main" } }, { upsert: true });
  const created = this.findOne({ key: "main" });
  if (withKey) created.select("+apiKey");
  return created;
};

const AdminNotifySetting =
  mongoose.models.AdminNotifySetting || mongoose.model("AdminNotifySetting", adminNotifySettingSchema);

export default AdminNotifySetting;
