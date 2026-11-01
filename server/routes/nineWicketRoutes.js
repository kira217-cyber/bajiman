import express from "express";
import mongoose from "mongoose";

import upload from "../config/multer.js";
import NineWicketSetting, { NINE_WICKET_DEFAULT_UID } from "../models/NineWicketSetting.js";
import NineWicketWallet from "../models/NineWicketWallet.js";
import User from "../models/User.js";
import { protectAdmin, requireMother } from "../middleware/protectAdmin.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { forgetNineWicketSetting, nwMoney, syncNineWicketBalance } from "../utils/nineWicket.js";

/*
 * 9 Wicket — admin side, /api/nine-wicket
 *   /admin    setting (on/off, name, image, position, Oracle URLs)
 *   /wallets  each player's 9 Wicket money — sent, returned, held in bets
 */
const router = express.Router();

const text = (value) => String(value ?? "").trim();
const langText = (input = {}) => ({ bn: text(input?.bn), en: text(input?.en) });
const isHttps = (url) => /^https:\/\/[^\s]+$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/i.test(url);

router.get("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await NineWicketSetting.current();
    const [wallets, exposure] = await Promise.all([
      NineWicketWallet.countDocuments(),
      NineWicketWallet.aggregate([{ $group: { _id: null, total: { $sum: "$exposureBalance" }, sent: { $sum: "$totalTransferred" }, back: { $sum: "$totalReturned" } } }]),
    ]);
    return successResponse(res, "9 Wicket setting loaded", {
      setting,
      defaultGameUId: NINE_WICKET_DEFAULT_UID,
      stats: {
        players: wallets,
        exposure: nwMoney(exposure[0]?.total),
        transferred: nwMoney(exposure[0]?.sent),
        returned: nwMoney(exposure[0]?.back),
      },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.put("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await NineWicketSetting.current();
    const body = req.body || {};

    if (typeof body.active === "boolean") setting.active = body.active;
    if (typeof body.autoReturn === "boolean") setting.autoReturn = body.autoReturn;
    if (body.name) setting.name = langText(body.name);
    if (body.image !== undefined) setting.image = text(body.image);
    if (body.categoryKey !== undefined) setting.categoryKey = text(body.categoryKey).toLowerCase() || "sports";
    if (body.position !== undefined) setting.position = Math.max(0, Number(body.position) || 0);
    if (body.gameUId !== undefined) setting.gameUId = text(body.gameUId) || NINE_WICKET_DEFAULT_UID;

    for (const field of ["transferUrl", "balanceUrl"]) {
      if (body[field] === undefined) continue;
      const url = text(body[field]);
      if (!isHttps(url)) return errorResponse(res, `${field} must start with https://`, 400);
      setting[field] = url;
    }

    await setting.save();
    forgetNineWicketSetting();
    return successResponse(res, "9 Wicket setting saved", { setting });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.post("/upload-image", protectAdmin, requireMother, upload.single("image"), (req, res) => {
  if (!req.file) return errorResponse(res, "Choose an image", 400);
  return successResponse(res, "Image uploaded", { image: `/uploads/${req.file.filename}` });
});

// Players' 9 Wicket wallets
router.get("/wallets", protectAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};

    const status = text(req.query.status);
    if (["idle", "playing", "exposure", "settled"].includes(status)) filter.status = status;
    if (req.query.hasExposure === "true") filter.exposureBalance = { $gt: 0 };

    const search = text(req.query.q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (search) {
      const users = await User.find({
        $or: [{ userId: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }, { nineWicketUsername: { $regex: search, $options: "i" } }],
      })
        .select("_id")
        .lean();
      filter.$or = [{ username: { $regex: search, $options: "i" } }, { user: { $in: users.map((u) => u._id) } }];
    }

    const [items, total] = await Promise.all([
      NineWicketWallet.find(filter)
        .populate("user", "userId phone balance isActive")
        .sort({ exposureBalance: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NineWicketWallet.countDocuments(filter),
    ]);

    return successResponse(res, "9 Wicket wallets loaded", {
      wallets: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// One player's — for the user details page
router.get("/wallets/:userId", protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return errorResponse(res, "Bad id", 400);
    const wallet = await NineWicketWallet.findOne({ user: req.params.userId }).lean();
    return successResponse(res, "9 Wicket wallet", { wallet });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Bring money left in 9 Wicket back now (when the player does not come back)
router.post("/wallets/:userId/sync", protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return errorResponse(res, "Bad id", 400);
    const result = await syncNineWicketBalance(req.params.userId, { force: true });
    return successResponse(res, result.added > 0 ? `৳${result.added} returned from 9 Wicket` : "Nothing to return", result);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
