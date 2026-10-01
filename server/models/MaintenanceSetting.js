import mongoose from "mongoose";

// Singleton. `enabled` is the admin's manual on/off switch — it persists
// until an admin explicitly changes it, independent of whether the API
// is currently healthy. The automatic "API is erroring" maintenance mode
// is a CLIENT-SIDE concern (see client/affiliate src/api/axios.js +
// MaintenanceGate) since the server obviously can't flip a DB flag for
// itself while it's the thing that's down — this doc only holds what the
// client needs once it CAN reach the API: the manual switch + which
// image to show for each site.
// A fixed, well-known _id (rather than an empty {} filter) is what
// actually makes the upsert-if-missing pattern in maintenanceRoutes.js
// atomic — _id carries a real unique index, so concurrent first-ever
// calls correctly serialize into one document instead of racing to
// create duplicates (verified: an empty-filter upsert with no unique
// index does NOT prevent that race).
const SINGLETON_ID = "maintenance-setting";

const MaintenanceSettingSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: SINGLETON_ID,
    },

    enabled: {
      type: Boolean,
      default: false,
    },

    // Desktop/mobile are shown on different-shaped screens (landscape vs
    // full-screen portrait), so one image stretched/cropped across both
    // never sits right on one of them — each site gets its own pair.
    clientImageDesktop: {
      type: String,
      default: "",
      trim: true,
    },

    clientImageMobile: {
      type: String,
      default: "",
      trim: true,
    },

    affiliateImageDesktop: {
      type: String,
      default: "",
      trim: true,
    },

    affiliateImageMobile: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

const MaintenanceSetting =
  mongoose.models.MaintenanceSetting ||
  mongoose.model("MaintenanceSetting", MaintenanceSettingSchema);

export { SINGLETON_ID };
export default MaintenanceSetting;
