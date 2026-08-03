import mongoose from "mongoose";

const SliderSchema = new mongoose.Schema(
  {
    desktopImage: {
      type: String,
      default: "",
      trim: true,
    },

    mobileImage: {
      type: String,
      default: "",
      trim: true,
    },

    order: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    sectionBg: {
      type: String,
      default: "#0B66A8",
      trim: true,
    },

    desktopSectionBg: {
      type: String,
      default: "#f5f5f5",
      trim: true,
    },

    slideBg: {
      type: String,
      default: "#082056",
      trim: true,
    },

    arrowColor: {
      type: String,
      default: "#9ca3af",
      trim: true,
    },

    arrowHoverColor: {
      type: String,
      default: "#4b5563",
      trim: true,
    },

    paginationBg: {
      type: String,
      default: "#7aa7d9",
      trim: true,
    },

    paginationActiveBg: {
      type: String,
      default: "#2f79c9",
      trim: true,
    },

    mobileSkeletonBg: {
      type: String,
      default: "rgba(255,255,255,0.2)",
      trim: true,
    },

    desktopSkeletonBg: {
      type: String,
      default: "#d1d5db",
      trim: true,
    },

    skeletonDotBg: {
      type: String,
      default: "rgba(122,167,217,0.5)",
      trim: true,
    },

    skeletonDotActiveBg: {
      type: String,
      default: "#7aa7d9",
      trim: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

SliderSchema.index({ status: 1, order: 1 });

const Slider = mongoose.models.Slider || mongoose.model("Slider", SliderSchema);

export default Slider;
