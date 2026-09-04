import express from "express";
import TurnoverProviderSetting from "../models/TurnoverProviderSetting.js";
import { protectAdmin } from "../middleware/protectAdmin.js";
import { successResponse, errorResponse } from "../utils/response.js";

const router = express.Router();

// Atomic find-or-create — see the same helper in otpSettingRoutes.js for
// why a plain findOne-then-create race is worth avoiding here too.
const getOrCreateSetting = async () => {
  return TurnoverProviderSetting.findOneAndUpdate(
    {},
    { $setOnInsert: { eligibleProviders: [] } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
};

const normalizeEligibleProviders = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      providerCode: String(item?.providerCode || "")
        .trim()
        .toUpperCase(),
      percent: Math.min(100, Math.max(0, Number(item?.percent ?? 100))),
    }))
    .filter((item) => item.providerCode);
};

/* ADMIN: get current setting */
router.get("/", protectAdmin, async (req, res) => {
  try {
    const setting = await getOrCreateSetting();
    return successResponse(res, "Turnover provider setting loaded", setting);
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

/* PUBLIC: eligible providers only, for the client Turnover History modal
   to show users which providers' games count toward turnover */
router.get("/public", async (req, res) => {
  try {
    const setting = await TurnoverProviderSetting.findOne()
      .select("eligibleProviders")
      .lean();

    return successResponse(res, "Turnover provider setting loaded", {
      eligibleProviders: setting?.eligibleProviders || [],
    });
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

/* ADMIN: replace the eligible provider list (with per-provider percent) */
router.put("/", protectAdmin, async (req, res) => {
  try {
    const eligibleProviders = normalizeEligibleProviders(
      req.body?.eligibleProviders,
    );

    // Each percent is a dedicated minimum share of every turnover's
    // required amount, so the shares can never add up to more than the
    // whole requirement.
    const totalPercent = eligibleProviders.reduce(
      (sum, item) => sum + item.percent,
      0,
    );

    if (totalPercent > 100) {
      return errorResponse(
        res,
        `Selected providers' percent adds up to ${totalPercent}% — the total can't exceed 100%.`,
        400,
      );
    }

    const setting = await getOrCreateSetting();
    setting.eligibleProviders = eligibleProviders;
    await setting.save();

    return successResponse(res, "Turnover provider setting updated", setting);
  } catch (error) {
    return errorResponse(res, error.message || "Server error", 500);
  }
});

export default router;
