import express from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import axios from "axios";

import AutoWithdrawSetting, {
  DEFAULT_METHODS,
} from "../models/AutoWithdrawSetting.js";
import AutoWithdraw from "../models/AutoWithdraw.js";
import User from "../models/User.js";
import EWallet from "../models/EWallet.js";
import upload from "../config/multer.js";

import { protectAdmin } from "../middleware/protectAdmin.js";
import protectUser from "../middleware/protectUser.js";
import { getOrCreateOtpSetting } from "./otpSettingRoutes.js";
import { checkUserOtp, consumeUserOtp } from "./eWalletRoutes.js";
import { checkEligibility } from "./withdrawRequestRoutes.js";
import { lockWithdraw, unlockWithdraw } from "../utils/withdrawLock.js";

const router = express.Router();

const ALLOWED_METHODS = ["bkash", "nagad", "rocket", "upay"];

/* ----------------------------- HELPERS ----------------------------- */

async function getOrCreateSetting() {
  return AutoWithdrawSetting.findOneAndUpdate(
    { key: "main" },
    {
      $setOnInsert: {
        key: "main",
        businessToken: "",
        active: false,
        minAmount: 500,
        maxAmount: 50000,
        methods: DEFAULT_METHODS,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
}

function safeString(value = "") {
  return String(value || "").trim();
}

function normalizeMoney(value, fallback = 0) {
  const num = Math.floor(Number(value || 0));
  return Number.isFinite(num) ? num : fallback;
}

const gatewayUrl = () =>
  process.env.OPAY_WITHDRAW_URL ||
  "https://api.oraclepay.org/api/opay-business/auto-withdraw";

const sameKey = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

const buildPublicUrls = () => ({
  backend: process.env.PUBLIC_BACKEND_URL,
  frontend: process.env.PUBLIC_FRONTEND_URL,
});

const normalizeWalletNumber = (value) => {
  let v = String(value || "").trim();
  if (v.startsWith("+880")) v = `0${v.slice(4)}`;
  else if (v.startsWith("880")) v = `0${v.slice(3)}`;
  return v;
};

const getUserIdFromReq = (req) => {
  const id = req.user?.id || req.user?._id || null;
  return id ? String(id) : null;
};

// Refunds a REJECTED withdraw exactly once, whether triggered by the
// gateway's own webhook or by an admin's manual reject.
const refundWithdraw = async (filter, patch = {}) => {
  const record = await AutoWithdraw.findOneAndUpdate(
    { ...filter, refunded: false },
    { $set: { status: "REJECTED", refunded: true, ...patch } },
    { returnDocument: "after" },
  );

  if (!record) return null;

  await User.updateOne(
    { _id: record.user },
    { $inc: { balance: Number(record.amount || 0) } },
  );

  return record;
};

/* ----------------------------- ADMIN: GET SETTINGS ----------------------------- */

router.get("/admin", protectAdmin, async (req, res) => {
  try {
    const setting = await getOrCreateSetting();

    return res.json({
      success: true,
      data: {
        businessToken: setting.businessToken || "",
        active: !!setting.active,
        minAmount: Number(setting.minAmount || 500),
        maxAmount: Number(setting.maxAmount || 0),
        methods: (setting.methods || []).map((m) => ({
          code: m.code,
          name: { bn: m?.name?.bn || "", en: m?.name?.en || "" },
          logoUrl: m.logoUrl || "",
          isActive: m.isActive !== false,
          order: Number(m.order || 0),
          minimumWithdrawAmount: Number(m.minimumWithdrawAmount || 0),
          maximumWithdrawAmount: Number(m.maximumWithdrawAmount || 0),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error",
    });
  }
});

/* ----------------------------- ADMIN: UPLOAD METHOD LOGO ----------------------------- */

router.post(
  "/admin/upload-logo",
  protectAdmin,
  upload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Logo file is required",
        });
      }

      return res.json({
        success: true,
        url: `/${req.file.path.replace(/\\/g, "/")}`,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error?.message || "Upload failed",
      });
    }
  },
);

/* ----------------------------- ADMIN: UPDATE SETTINGS ----------------------------- */

router.put("/admin", protectAdmin, async (req, res) => {
  try {
    const { businessToken, active, minAmount, maxAmount, methods } = req.body;

    const setting = await getOrCreateSetting();

    if (typeof businessToken === "string") {
      setting.businessToken = businessToken.trim();
    }

    if (typeof active === "boolean") {
      setting.active = active;
    }

    const min = normalizeMoney(minAmount, 500);
    const max = normalizeMoney(maxAmount, 0);

    setting.minAmount = Math.max(1, min);
    setting.maxAmount = Math.max(0, max);

    if (setting.maxAmount > 0 && setting.minAmount > setting.maxAmount) {
      return res.status(400).json({
        success: false,
        message: "minAmount cannot be greater than maxAmount",
      });
    }

    if (Array.isArray(methods)) {
      const byCode = new Map(
        (setting.methods || []).map((m) => [m.code, m]),
      );

      setting.methods = ALLOWED_METHODS.map((code, index) => {
        const incoming = methods.find((m) => m?.code === code) || {};
        const existing = byCode.get(code);

        return {
          code,
          name: {
            bn: safeString(incoming?.name?.bn ?? existing?.name?.bn),
            en: safeString(incoming?.name?.en ?? existing?.name?.en),
          },
          logoUrl: safeString(incoming?.logoUrl ?? existing?.logoUrl),
          isActive:
            incoming?.isActive !== undefined
              ? incoming.isActive !== false
              : existing?.isActive !== false,
          order: Number.isFinite(Number(incoming?.order))
            ? Number(incoming.order)
            : existing?.order ?? index,
          minimumWithdrawAmount: Math.max(
            0,
            normalizeMoney(
              incoming?.minimumWithdrawAmount ?? existing?.minimumWithdrawAmount,
              0,
            ),
          ),
          maximumWithdrawAmount: Math.max(
            0,
            normalizeMoney(
              incoming?.maximumWithdrawAmount ?? existing?.maximumWithdrawAmount,
              0,
            ),
          ),
        };
      });
    }

    await setting.save();

    return res.json({
      success: true,
      message: "Auto withdraw settings updated successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Update failed",
    });
  }
});

/* ----------------------------- CLIENT: STATUS ----------------------------- */

router.get("/status", async (req, res) => {
  try {
    const setting = await getOrCreateSetting();
    const ready = !!(setting.active && setting.businessToken);

    const methods = ready
      ? [...(setting.methods || [])]
          .filter((m) => m.isActive !== false)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
          .map((m) => ({
            code: m.code,
            name: { bn: m?.name?.bn || "", en: m?.name?.en || "" },
            logoUrl: m.logoUrl || "",
            minimumWithdrawAmount: Number(m.minimumWithdrawAmount || 0),
            maximumWithdrawAmount: Number(m.maximumWithdrawAmount || 0),
          }))
      : [];

    return res.json({
      success: true,
      data: {
        active: ready && methods.length > 0,
        minAmount: Number(setting.minAmount || 500),
        maxAmount: Number(setting.maxAmount || 0),
        methods,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error",
    });
  }
});

/* ----------------------------- CLIENT: CREATE AUTO WITHDRAW ----------------------------- */

router.post("/create", protectUser, async (req, res) => {
  const userId = getUserIdFromReq(req);
  let locked = false;

  try {
    const setting = await getOrCreateSetting();

    if (!setting.active || !setting.businessToken) {
      return res.status(400).json({
        success: false,
        message: "Auto Withdraw is disabled by admin.",
      });
    }

    const methodCode = safeString(req.body?.methodCode).toLowerCase();
    const walletId = safeString(req.body?.walletId);
    const amount = normalizeMoney(req.body?.amount, 0);
    const otp = safeString(req.body?.otp);

    if (!ALLOWED_METHODS.includes(methodCode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (!walletId || !mongoose.Types.ObjectId.isValid(walletId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid wallet id",
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const method = (setting.methods || []).find(
      (m) => m.code === methodCode && m.isActive !== false,
    );

    if (!method) {
      return res.status(400).json({
        success: false,
        message: "This payment method is not available",
      });
    }

    const minAmount = Math.max(
      Number(setting.minAmount || 0),
      Number(method.minimumWithdrawAmount || 0),
    );
    const methodMax = Number(method.maximumWithdrawAmount || 0);
    const settingMax = Number(setting.maxAmount || 0);
    const maxAmount =
      methodMax > 0 && settingMax > 0
        ? Math.min(methodMax, settingMax)
        : methodMax || settingMax;

    if (minAmount > 0 && amount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdraw amount is ${minAmount}`,
      });
    }

    if (maxAmount > 0 && amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum withdraw amount is ${maxAmount}`,
      });
    }

    const eligibility = await checkEligibility(userId);

    if (!eligibility.eligible) {
      return res.status(409).json({
        success: false,
        code: eligibility.hasPendingWithdraw
          ? "PENDING_WITHDRAW_EXISTS"
          : "TURNOVER_NOT_FULFILLED",
        message: eligibility.message,
        data: { remaining: eligibility.remaining },
      });
    }

    locked = await lockWithdraw(userId);

    if (!locked) {
      return res.status(409).json({
        success: false,
        message:
          "আপনার আগের withdraw request টা এখনো process হচ্ছে, কিছুক্ষণ পর আবার চেষ্টা করুন।",
      });
    }

    const wallet = await EWallet.findOne({
      _id: walletId,
      user: userId,
      isActive: true,
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    const otpSetting = await getOrCreateOtpSetting();

    if (otpSetting.withdrawEnabled) {
      if (!otp) {
        return res.status(400).json({
          success: false,
          message: "OTP is required",
        });
      }

      const otpResult = checkUserOtp(userId, otp);

      if (!otpResult.ok) {
        return res.status(400).json({
          success: false,
          message: otpResult.message,
        });
      }
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "User is inactive",
      });
    }

    const balanceBefore = Number(user.balance || 0);

    if (balanceBefore < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Atomic conditional deduction — guards against the balance changing
    // (another withdraw, a game bet) between the read above and this write.
    const deducted = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { returnDocument: "after" },
    );

    if (!deducted) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    const balanceAfter = Number(deducted.balance || 0);
    const accountNumber = normalizeWalletNumber(wallet.walletNumber);
    const callbackKey = crypto.randomBytes(24).toString("hex");

    let withdrawDoc = await AutoWithdraw.create({
      user: user._id,
      userIdentity: String(user._id),
      amount,
      paymentMethod: methodCode,
      methodName: { bn: method?.name?.bn || "", en: method?.name?.en || "" },
      wallet: wallet._id,
      accountNumber,
      status: "PENDING",
      balanceBefore,
      balanceAfter,
      callbackKey,
    });

    const { backend, frontend } = buildPublicUrls();

    if (!backend || !frontend) {
      await refundWithdraw(
        { _id: withdrawDoc._id },
        { reason: "PUBLIC_BACKEND_URL / PUBLIC_FRONTEND_URL missing" },
      );

      return res.status(500).json({
        success: false,
        message: "PUBLIC_BACKEND_URL and PUBLIC_FRONTEND_URL are required",
      });
    }

    const callbackUrl = `${backend}/api/auto-withdraw/webhook/${callbackKey}`;

    try {
      const opayRes = await axios.post(
        gatewayUrl(),
        {
          amount,
          payment_method: methodCode,
          user_identity_address: String(user._id),
          account_number: accountNumber,
          callback_url: callbackUrl,
          checkout_items: { withdrawId: String(withdrawDoc._id) },
        },
        {
          headers: {
            "X-Opay-Business-Token": String(setting.businessToken || "").trim(),
            "Content-Type": "application/json",
          },
          timeout: 20000,
        },
      );

      if (!opayRes?.data?.success) {
        throw new Error(opayRes?.data?.message || "Gateway rejected request");
      }

      const gatewayData = opayRes?.data?.data || {};

      withdrawDoc = await AutoWithdraw.findByIdAndUpdate(
        withdrawDoc._id,
        {
          $set: {
            status: "PROCESSING",
            withdrawalId: safeString(gatewayData.withdrawal_id),
            feePercentage: Number(gatewayData.fee_percentage || 0),
            feeAmount: Number(gatewayData.fee_amount || 0),
            deductedAmount: Number(gatewayData.deducted_amount || amount),
          },
        },
        { returnDocument: "after" },
      );

      if (otpSetting.withdrawEnabled) {
        consumeUserOtp(userId);
      }

      return res.status(201).json({
        success: true,
        message: "Auto withdraw request submitted",
        data: withdrawDoc,
      });
    } catch (gatewayError) {
      await refundWithdraw(
        { _id: withdrawDoc._id },
        {
          reason:
            gatewayError?.response?.data?.message ||
            gatewayError?.message ||
            "Gateway request failed",
        },
      );

      return res.status(502).json({
        success: false,
        message:
          gatewayError?.response?.data?.message ||
          gatewayError?.message ||
          "Failed to submit auto withdraw. Your balance has been refunded.",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error",
    });
  } finally {
    if (locked) await unlockWithdraw(userId);
  }
});

/* ----------------------------- USER: HISTORY ----------------------------- */

router.get("/history/my", protectUser, async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      100,
    );
    const skip = (page - 1) * limit;

    const status = safeString(req.query.status).toUpperCase();
    const filter = { user: userId };

    if (["PENDING", "PROCESSING", "COMPLETED", "REJECTED"].includes(status)) {
      filter.status = status;
    }

    const [data, total] = await Promise.all([
      AutoWithdraw.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AutoWithdraw.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error",
    });
  }
});

/* ----------------------------- ADMIN: HISTORY ----------------------------- */

router.get("/withdrawals/admin", protectAdmin, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100,
    );
    const skip = (page - 1) * limit;

    const q = safeString(req.query.q);
    const status = safeString(req.query.status).toUpperCase();

    const matchStage = {};

    if (["PENDING", "PROCESSING", "COMPLETED", "REJECTED"].includes(status)) {
      matchStage.status = status;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDoc",
        },
      },
      { $addFields: { userDoc: { $arrayElemAt: ["$userDoc", 0] } } },
      ...(q
        ? [
            {
              $match: {
                $or: [
                  { "userDoc.userId": { $regex: q, $options: "i" } },
                  { "userDoc.phone": { $regex: q, $options: "i" } },
                  { accountNumber: { $regex: q, $options: "i" } },
                  { withdrawalId: { $regex: q, $options: "i" } },
                ],
              },
            },
          ]
        : []),
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                amount: 1,
                paymentMethod: 1,
                methodName: 1,
                accountNumber: 1,
                withdrawalId: 1,
                feePercentage: 1,
                feeAmount: 1,
                deductedAmount: 1,
                status: 1,
                proofImages: 1,
                reason: 1,
                balanceBefore: 1,
                balanceAfter: 1,
                createdAt: 1,
                updatedAt: 1,
                completedAt: 1,
                userMongoId: "$userDoc._id",
                userDbUserId: { $ifNull: ["$userDoc.userId", "Unknown"] },
                userPhone: { $ifNull: ["$userDoc.phone", ""] },
              },
            },
          ],
          total: [{ $count: "count" }],
          summary: [
            {
              $group: {
                _id: "$status",
                amount: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const result = await AutoWithdraw.aggregate(pipeline);

    const data = result?.[0]?.data || [];
    const total = result?.[0]?.total?.[0]?.count || 0;
    const summaryRows = result?.[0]?.summary || [];

    const summary = {
      pendingAmount: 0,
      pendingCount: 0,
      processingAmount: 0,
      processingCount: 0,
      completedAmount: 0,
      completedCount: 0,
      rejectedAmount: 0,
      rejectedCount: 0,
    };

    summaryRows.forEach((row) => {
      const st = String(row?._id || "PENDING").toLowerCase();
      const amount = Number(row.amount || 0);
      const count = Number(row.count || 0);

      if (st === "pending") {
        summary.pendingAmount = amount;
        summary.pendingCount = count;
      } else if (st === "processing") {
        summary.processingAmount = amount;
        summary.processingCount = count;
      } else if (st === "completed") {
        summary.completedAmount = amount;
        summary.completedCount = count;
      } else if (st === "rejected") {
        summary.rejectedAmount = amount;
        summary.rejectedCount = count;
      }
    });

    return res.json({
      success: true,
      data,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Server error",
    });
  }
});

/* ----------------------------- ADMIN: MANUAL REJECT + REFUND ----------------------------- */

router.post("/withdrawals/:id/reject", protectAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid id",
      });
    }

    const record = await AutoWithdraw.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }

    if (record.status === "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Already completed, cannot reject",
      });
    }

    const reason = safeString(req.body?.reason) || "Rejected by admin";

    const updated = await refundWithdraw(
      { _id: record._id },
      {
        reason,
        reviewedBy: req.admin?._id || null,
        reviewNote: reason,
      },
    );

    if (!updated) {
      return res.status(400).json({
        success: false,
        message: "This withdraw was already refunded",
      });
    }

    return res.json({
      success: true,
      message: "Rejected and refunded successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Reject failed",
    });
  }
});

/* ----------------------------- WEBHOOK ----------------------------- */

router.post("/webhook/:key", async (req, res) => {
  res.send("OK");

  try {
    const data = req.body || {};
    const key = req.params.key;

    const withdrawId = safeString(
      data?.checkout_items?.withdrawId || data?.withdrawal_id,
    );
    const statusRaw = safeString(data.status).toUpperCase();

    const record = withdrawId
      ? await AutoWithdraw.findById(withdrawId).select("+callbackKey")
      : null;

    if (!record || !sameKey(record.callbackKey, key)) {
      console.log("auto-withdraw webhook: unknown or key mismatch");
      return;
    }

    if (statusRaw === "PROCESSING") {
      await AutoWithdraw.updateOne(
        { _id: record._id, status: "PENDING" },
        { $set: { status: "PROCESSING" } },
      );
      return;
    }

    if (statusRaw === "COMPLETED") {
      const proofImages = Array.isArray(data.proof_images)
        ? data.proof_images
        : [];

      await AutoWithdraw.updateOne(
        { _id: record._id, status: { $in: ["PENDING", "PROCESSING"] } },
        {
          $set: {
            status: "COMPLETED",
            proofImages,
            completedAt: new Date(),
          },
        },
      );

      console.log("✅ auto withdraw completed:", String(record._id));
      return;
    }

    if (statusRaw === "REJECTED") {
      const reason = safeString(data.reason) || "Rejected by gateway";

      await refundWithdraw({ _id: record._id }, { reason });

      console.log("auto withdraw rejected + refunded:", String(record._id));
      return;
    }

    console.log("auto-withdraw webhook: unhandled status", statusRaw);
  } catch (error) {
    console.error("auto-withdraw webhook error:", error?.message || error);
  }
});

export default router;
