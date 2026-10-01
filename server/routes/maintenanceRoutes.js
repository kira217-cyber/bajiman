import express from "express";
import fs from "fs";
import path from "path";
import MaintenanceSetting, {
  SINGLETON_ID,
} from "../models/MaintenanceSetting.js";
import { protectAdmin } from "../middleware/protectAdmin.js";
import upload from "../config/multer.js";
import { successResponse, errorResponse } from "../utils/response.js";

const router = express.Router();

const filePath = (file) => {
  if (!file) return "";
  return file.path.replace(/\\/g, "/");
};

const buildFileUrl = (req, value = "") => {
  if (!value) return "";
  if (String(value).startsWith("http")) return value;

  const normalized = String(value).replace(/\\/g, "/");
  return `${req.protocol}://${req.get("host")}/${normalized}`;
};

const deleteLocalFile = (value = "") => {
  try {
    if (!value || String(value).startsWith("http")) return;

    const fullPath = path.resolve(value);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (error) {
    console.log("MAINTENANCE FILE DELETE ERROR:", error.message);
  }
};

// Atomic find-or-create, keyed on the fixed singleton _id so concurrent
// first-ever calls can't race into creating two documents (an empty {}
// filter has no unique index backing it and does NOT prevent that).
const getOrCreateSetting = async () => {
  return MaintenanceSetting.findOneAndUpdate(
    { _id: SINGLETON_ID },
    {
      $setOnInsert: {
        enabled: false,
        clientImageDesktop: "",
        clientImageMobile: "",
        affiliateImageDesktop: "",
        affiliateImageMobile: "",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

const IMAGE_FIELDS = [
  "clientImageDesktop",
  "clientImageMobile",
  "affiliateImageDesktop",
  "affiliateImageMobile",
];

const uploadFields = upload.fields(
  IMAGE_FIELDS.map((name) => ({ name, maxCount: 1 })),
);

const buildImageUrls = (req, setting) =>
  IMAGE_FIELDS.reduce((acc, field) => {
    acc[`${field}Url`] = buildFileUrl(req, setting[field]);
    return acc;
  }, {});

/* ======================================================
   PUBLIC: current maintenance status
   GET /api/maintenance/status
   No auth — this is what the client/affiliate apps poll, including
   while the rest of the API may be unhealthy, so it must stay this
   simple and side-effect-free.
====================================================== */
router.get("/status", async (req, res) => {
  try {
    const setting = await getOrCreateSetting();

    return successResponse(res, "Maintenance status loaded", {
      enabled: Boolean(setting.enabled),
      ...buildImageUrls(req, setting),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

/* ======================================================
   ADMIN: get full setting
   GET /api/maintenance
====================================================== */
router.get("/", protectAdmin, async (req, res) => {
  try {
    const setting = await getOrCreateSetting();

    return successResponse(res, "Maintenance setting loaded", {
      enabled: Boolean(setting.enabled),
      ...buildImageUrls(req, setting),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

/* ======================================================
   ADMIN: manual on/off toggle
   PUT /api/maintenance/toggle
====================================================== */
router.put("/toggle", protectAdmin, async (req, res) => {
  try {
    const enabled = req.body?.enabled === true || req.body?.enabled === "true";

    const setting = await MaintenanceSetting.findOneAndUpdate(
      { _id: SINGLETON_ID },
      { $set: { enabled } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    return successResponse(res, "Maintenance mode updated", {
      enabled: Boolean(setting.enabled),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

/* ======================================================
   ADMIN: upload client/affiliate maintenance images
   POST /api/maintenance/upload
====================================================== */
router.post("/upload", protectAdmin, uploadFields, async (req, res) => {
  const uploadedFiles = IMAGE_FIELDS.reduce((acc, field) => {
    const file = req.files?.[field]?.[0];
    if (file) acc[field] = file;
    return acc;
  }, {});

  try {
    if (!Object.keys(uploadedFiles).length) {
      return errorResponse(res, "No image uploaded", 400);
    }

    const existing = await getOrCreateSetting();
    const update = {};

    for (const field of Object.keys(uploadedFiles)) {
      update[field] = filePath(uploadedFiles[field]);
    }

    const setting = await MaintenanceSetting.findOneAndUpdate(
      { _id: existing._id },
      { $set: update },
      { returnDocument: "after" },
    );

    for (const field of Object.keys(uploadedFiles)) {
      if (existing[field]) deleteLocalFile(existing[field]);
    }

    return successResponse(res, "Maintenance image updated", {
      enabled: Boolean(setting.enabled),
      ...buildImageUrls(req, setting),
    });
  } catch (error) {
    for (const file of Object.values(uploadedFiles)) {
      deleteLocalFile(filePath(file));
    }

    return errorResponse(res, error.message || "Server error", 500);
  }
});

export default router;
