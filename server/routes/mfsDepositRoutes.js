import crypto from "crypto";
import express from "express";
import mongoose from "mongoose";

import upload from "../config/multer.js";
import MfsSetting, { MFS_METHODS, MFS_DEFAULT_URL } from "../models/MfsSetting.js";
import MfsDeposit from "../models/MfsDeposit.js";
import TurnOver from "../models/TurnOver.js";
import User from "../models/User.js";

import { protectAdmin, requireMother } from "../middleware/protectAdmin.js";
import protectUser from "../middleware/protectUser.js";
import { successResponse, errorResponse } from "../utils/response.js";
import {
  computeBonus,
  normalizeEligibleProviders,
  sumPercent,
} from "./autoDepositRoutes.js";
import { notifyAdmin, taka } from "../utils/adminNotify.js";

/*
 * Personal Auto Deposit (MFSWallet) — /api/mfs-deposit
 *
 * The player picks a method (bKash/Nagad/Rocket/Upay) and an amount -> we
 * store a PENDING payment and ask MFSWallet's create-link for a payment page
 * -> the player pays there -> MFSWallet's SIM app matches the SMS and calls
 * one of three webhooks: success (balance credited), pending (admin checks
 * it by hand) or reject.
 *
 * MFSWallet signs nothing and has no status API, so:
 *   - every payment carries its own secret key in its webhook URLs
 *   - short_code, amount and method must match our record
 *   - balance is credited once only (claimed atomically on `balanceAdded`)
 */
const router = express.Router();

const text = (value) => String(value ?? "").trim();
const num = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (value) => Math.round(num(value) * 100) / 100;
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value));
const langText = (input = {}) => ({ bn: text(input?.bn), en: text(input?.en) });
const base = (url) => text(url).replace(/\/+$/, "");

function sameKey(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Methods coming from admin — only MFSWallet's four, each once
function cleanMethods(list) {
  if (!Array.isArray(list)) return null;

  const seen = new Set();

  return list
    .map((item, index) => ({
      ...(isId(item?._id) ? { _id: item._id } : {}),
      code: text(item?.code).toLowerCase(),
      name: langText(item?.name),
      logoUrl: text(item?.logoUrl),
      active: item?.active !== false,
      order: Math.max(0, num(item?.order ?? index)),
      minAmount: Math.max(0, num(item?.minAmount)),
      maxAmount: Math.max(0, num(item?.maxAmount)),
    }))
    .filter(
      (item) =>
        MFS_METHODS.includes(item.code) &&
        !seen.has(item.code) &&
        seen.add(item.code),
    );
}

// A method's own limits when set, otherwise the general ones
const limitsOf = (setting, method) => ({
  min: num(method?.minAmount) > 0 ? num(method.minAmount) : num(setting.minAmount),
  max: num(method?.maxAmount) > 0 ? num(method.maxAmount) : num(setting.maxAmount),
});

// MFSWallet create-link — Bearer API key, give up after 20 seconds
async function createLink(setting, body) {
  const res = await fetch(setting.apiUrl || MFS_DEFAULT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(setting.apiKey || "").trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Gateway answered ${res.status}`);
  }

  return data;
}

const publicServer = (req) =>
  base(process.env.PUBLIC_BACKEND_URL) || `${req.protocol}://${req.get("host")}`;

/* ----------------------------- CLIENT: STATUS ----------------------------- */

router.get("/status", async (req, res) => {
  try {
    const setting = await MfsSetting.current();
    const ready = setting.active && Boolean(setting.apiKey);

    const methods = ready
      ? (setting.methods || [])
          .filter((method) => method.active !== false)
          .sort((a, b) => num(a.order) - num(b.order))
          .map((method) => {
            const { min, max } = limitsOf(setting, method);

            return {
              code: method.code,
              name: method.name,
              logoUrl: method.logoUrl,
              minAmount: min,
              maxAmount: max,
            };
          })
      : [];

    return successResponse(res, "Personal auto deposit status", {
      enabled: ready && methods.length > 0,
      displayName: setting.displayName,
      minAmount: setting.minAmount,
      maxAmount: setting.maxAmount,
      methods,
      bonuses: ready
        ? (setting.bonuses || [])
            .filter((bonus) => bonus.isActive !== false)
            .sort((a, b) => num(a.order) - num(b.order))
            .map((bonus) => ({
              _id: String(bonus._id),
              title: bonus.title,
              bonusType: bonus.bonusType,
              bonusScope: bonus.bonusScope,
              bonusValue: bonus.bonusValue,
              turnoverMultiplier: bonus.turnoverMultiplier,
            }))
        : [],
    });
  } catch {
    // When unknown, treat it as off — the other deposit paths still work
    return successResponse(res, "Personal auto deposit unavailable", {
      enabled: false,
      methods: [],
      bonuses: [],
    });
  }
});

/* ----------------------------- CLIENT: CREATE PAYMENT ----------------------------- */

router.post("/create", protectUser, async (req, res) => {
  try {
    const setting = await MfsSetting.current();

    if (!setting.active || !setting.apiKey) {
      return errorResponse(res, "Personal auto deposit is disabled by admin.", 400);
    }

    const method = (setting.methods || []).find(
      (item) =>
        item.code === text(req.body?.method).toLowerCase() && item.active !== false,
    );

    if (!method) return errorResponse(res, "Choose a payment method", 400);

    const amount = Math.floor(num(req.body?.amount));
    const { min, max } = limitsOf(setting, method);

    if (!(amount > 0)) return errorResponse(res, "Invalid amount", 400);
    if (amount < min) return errorResponse(res, `Minimum amount is ${min}`, 400);
    if (max > 0 && amount > max) return errorResponse(res, `Maximum amount is ${max}`, 400);

    const user = await User.findById(req.user.id).select("_id userId phone isActive");

    if (!user) return errorResponse(res, "User not found", 404);
    if (user.isActive !== true) return errorResponse(res, "User is inactive", 403);

    let bonus = null;
    const bonusId = text(req.body?.selectedBonusId);

    if (bonusId) {
      bonus = isId(bonusId) ? setting.bonuses.id(bonusId) : null;

      if (!bonus || bonus.isActive === false) {
        return errorResponse(res, "Selected bonus is invalid or inactive", 400);
      }

      if (bonus.bonusScope === "first-deposit") {
        const paid = await MfsDeposit.exists({
          user: user._id,
          status: "PAID",
          balanceAdded: true,
        });

        if (paid) {
          return errorResponse(
            res,
            "This bonus is only available for the first personal auto deposit.",
            400,
          );
        }
      }
    }

    const calc = computeBonus({ amount, selectedBonus: bonus });

    const invoiceNumber = `MF${Date.now()}${crypto.randomInt(100, 1000)}`;
    const callbackKey = crypto.randomBytes(24).toString("hex");

    const deposit = await MfsDeposit.create({
      user: user._id,
      userIdText: user.userId,
      amount,
      method: method.code,
      invoiceNumber,
      callbackKey,
      selectedBonus: calc.selectedBonus,
      calc: {
        depositAmount: calc.depositAmount,
        bonusAmount: calc.bonusAmount,
        creditedAmount: calc.creditedAmount,
        turnoverMultiplier: calc.turnoverMultiplier,
        targetTurnover: calc.targetTurnover,
      },
    });

    const server = publicServer(req);
    const client = base(process.env.PUBLIC_FRONTEND_URL);

    let domain = "";
    try {
      domain = new URL(client).hostname;
    } catch {
      domain = req.hostname;
    }

    // Return URL — the client home shows the payment's real state
    const back = (result) => `${client}/?mfs=${invoiceNumber}&result=${result}`;
    const hook = (kind) => `${server}/api/mfs-deposit/webhook/${kind}/${callbackKey}`;

    const fail = async (message) => {
      await MfsDeposit.updateOne(
        { _id: deposit._id },
        { $set: { status: "FAILED", gatewayMessage: String(message || "").slice(0, 300) } },
      );

      setting.lastError = String(message || "").slice(0, 300);
      await setting.save();
    };

    try {
      const data = await createLink(setting, {
        amount,
        method: method.code,
        user_identyfy_address: user.phone || user.userId,
        domain,
        success_redirect_url: back("success"),
        fail_redirect_url: back("fail"),
        pending_redirect_url: back("pending"),
        call_back_url: hook("success"),
        pending_call_back: hook("pending"),
        reject_call_back: hook("reject"),
        checkout_items: { invoice: invoiceNumber, userId: user.userId },
      });

      if (!data?.success || !data?.payment_page_url || !data?.short_code) {
        await fail(data?.message || "Gateway did not return a payment page");
        return errorResponse(res, "Failed to create payment link", 400);
      }

      await MfsDeposit.updateOne(
        { _id: deposit._id },
        { $set: { shortCode: text(data.short_code).slice(0, 120) } },
      );

      if (setting.lastError) {
        setting.lastError = "";
        await setting.save();
      }

      return successResponse(res, "Payment started", {
        invoiceNumber,
        amount,
        payment_page_url: data.payment_page_url,
      });
    } catch (gatewayError) {
      await fail(gatewayError.message);
      return errorResponse(res, "Could not reach the payment gateway", 502);
    }
  } catch (error) {
    return errorResponse(res, error.message || "Create payment failed", 500);
  }
});

/* ----------------------------- USER: HISTORY ----------------------------- */

router.get("/history/my", protectUser, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "10", 10) || 10));

    const filter = { user: req.user.id };
    const status = text(req.query.status).toUpperCase();

    if (["PENDING", "PAID", "FAILED"].includes(status)) filter.status = status;

    const [data, total] = await Promise.all([
      MfsDeposit.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-calc.affiliateDepositCommission")
        .lean(),
      MfsDeposit.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// The player comes back from the gateway (?mfs=...) and sees the real state
router.get("/my/:invoice", protectUser, async (req, res) => {
  try {
    const deposit = await MfsDeposit.findOne({
      user: req.user.id,
      invoiceNumber: text(req.params.invoice),
    })
      .select("invoiceNumber amount method status needsReview paidAt calc.creditedAmount")
      .lean();

    if (!deposit) return errorResponse(res, "Not found", 404);

    return successResponse(res, "Personal auto deposit", { deposit });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

/* ----------------------------- ADMIN: SETTINGS ----------------------------- */

router.get("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await MfsSetting.current();

    return successResponse(res, "Personal auto deposit setting loaded", {
      setting: setting.toSafeJSON(),
      webhookBase: `${publicServer(req)}/api/mfs-deposit/webhook`,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.put("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await MfsSetting.current();
    const body = req.body || {};

    // An empty key keeps the saved one — otherwise a save would wipe it
    if (text(body.apiKey)) setting.apiKey = text(body.apiKey);

    // Removing the key also turns it off
    if (body.clearKey === true) {
      setting.apiKey = "";
      setting.active = false;
    }

    if (typeof body.active === "boolean" && body.clearKey !== true) {
      setting.active = body.active;
    }

    if (body.apiUrl !== undefined) {
      const url = text(body.apiUrl) || MFS_DEFAULT_URL;

      // https only — plain http is allowed for localhost testing
      if (
        !/^https:\/\/[^\s]+$/i.test(url) &&
        !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/i.test(url)
      ) {
        return errorResponse(res, "API URL must start with https://", 400);
      }

      setting.apiUrl = url;
    }

    if (body.displayName) setting.displayName = langText(body.displayName);

    if (body.minAmount !== undefined) setting.minAmount = Math.max(1, num(body.minAmount));
    if (body.maxAmount !== undefined) setting.maxAmount = Math.max(0, num(body.maxAmount));

    if (setting.maxAmount > 0 && setting.minAmount > setting.maxAmount) {
      return errorResponse(res, "minAmount cannot be greater than maxAmount", 400);
    }

    const methods = cleanMethods(body.methods);
    if (methods) setting.methods = methods;

    if (Array.isArray(body.bonuses)) {
      const bonuses = body.bonuses
        .map((item, index) => ({
          ...(isId(item?._id) ? { _id: item._id } : {}),
          title: langText(item?.title),
          bonusType: item?.bonusType === "percent" ? "percent" : "fixed",
          bonusValue: Math.max(0, num(item?.bonusValue)),
          turnoverMultiplier: Math.max(0, num(item?.turnoverMultiplier ?? 1)),
          bonusScope: item?.bonusScope === "first-deposit" ? "first-deposit" : "all-time",
          isActive: item?.isActive !== false,
          order: Math.max(0, num(item?.order ?? index)),
          eligibleProviders: normalizeEligibleProviders(item?.eligibleProviders),
        }))
        .filter((item) => item.title.bn || item.title.en);

      for (const bonus of bonuses) {
        if (sumPercent(bonus.eligibleProviders) > 100) {
          return errorResponse(
            res,
            `Bonus "${bonus.title.bn || bonus.title.en}" eligible providers' percent adds up to more than 100%`,
            400,
          );
        }
      }

      setting.bonuses = bonuses;
    }

    if (setting.active && !setting.apiKey) {
      return errorResponse(res, "Add the API key before turning it on", 400);
    }

    await setting.save();

    return successResponse(res, "Personal auto deposit settings updated successfully", {
      setting: setting.toSafeJSON(),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Update failed", 500);
  }
});

router.post("/upload-logo", protectAdmin, requireMother, upload.single("logo"), (req, res) => {
  if (!req.file) return errorResponse(res, "Choose an image", 400);

  return successResponse(res, "Logo uploaded", { logoUrl: `/uploads/${req.file.filename}` });
});

/* ----------------------------- ADMIN: HISTORY ----------------------------- */

router.get("/deposits/admin", protectAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10) || 20));

    const filter = {};
    const status = text(req.query.status).toUpperCase();

    if (status === "REVIEW") Object.assign(filter, { status: "PENDING", needsReview: true });
    else if (["PENDING", "PAID", "FAILED"].includes(status)) filter.status = status;

    const method = text(req.query.method).toLowerCase();
    if (MFS_METHODS.includes(method)) filter.method = method;

    if (isId(req.query.userId)) filter.user = new mongoose.Types.ObjectId(String(req.query.userId));

    const search = text(req.query.q)
      .slice(0, 60)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    if (search) {
      filter.$or = [
        { userIdText: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
        { shortCode: { $regex: search, $options: "i" } },
        { transactionId: { $regex: search, $options: "i" } },
        { senderNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [data, total, counts, review] = await Promise.all([
      MfsDeposit.find(filter)
        .populate("user", "userId phone balance role")
        .populate("reviewedBy", "email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MfsDeposit.countDocuments(filter),
      MfsDeposit.aggregate([
        { $match: filter },
        { $group: { _id: "$status", n: { $sum: 1 }, amt: { $sum: "$amount" } } },
      ]),
      MfsDeposit.countDocuments({
        ...(filter.user ? { user: filter.user } : {}),
        status: "PENDING",
        needsReview: true,
      }),
    ]);

    const summary = {
      paidAmount: 0,
      pendingAmount: 0,
      failedAmount: 0,
      paidCount: 0,
      pendingCount: 0,
      failedCount: 0,
      reviewCount: review,
    };

    counts.forEach((row) => {
      const key = { PAID: "paid", FAILED: "failed", PENDING: "pending" }[
        String(row._id || "").toUpperCase()
      ];

      if (key) {
        summary[`${key}Amount`] = money(row.amt);
        summary[`${key}Count`] = row.n;
      }
    });

    return res.json({
      success: true,
      data,
      summary,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

/*
 * Credit a payment — used by the success webhook and by admin's confirm.
 *
 * Claimed atomically on `balanceAdded: false`, so a payment is never credited
 * twice (repeated webhook, or webhook and admin at the same moment). Balance
 * uses $inc so a parallel game callback is never lost. Affiliate commission
 * and turnover follow the auto deposit rules.
 */
async function creditDeposit(filter, patch = {}) {
  const deposit = await MfsDeposit.findOneAndUpdate(
    { ...filter, balanceAdded: false },
    {
      $set: {
        status: "PAID",
        needsReview: false,
        balanceAdded: true,
        paidAt: new Date(),
        ...patch,
      },
    },
    { returnDocument: "after" },
  );

  // Already credited — nothing to do
  if (!deposit) return null;

  const creditedAmount = num(deposit.calc?.creditedAmount ?? deposit.amount);
  const targetTurnover = num(deposit.calc?.targetTurnover ?? deposit.amount);

  const user = await User.findByIdAndUpdate(
    deposit.user,
    { $inc: { balance: creditedAmount } },
    { returnDocument: "after" },
  ).select("referredBy");

  notifyAdmin("mfs-deposit", {
    message: `${deposit.userIdText} · ${taka(deposit.amount)} · ${deposit.method}`,
  });

  // Referring affiliate's deposit commission (% of the deposit itself)
  if (user?.referredBy) {
    const affiliator = await User.findById(user.referredBy).select(
      "userId role isActive depositCommission",
    );
    const pct = num(affiliator?.depositCommission);

    if (affiliator && affiliator.role === "aff-user" && affiliator.isActive && pct > 0) {
      const commissionAmount = (num(deposit.amount) * pct) / 100;

      if (commissionAmount > 0) {
        await User.updateOne(
          { _id: affiliator._id },
          { $inc: { depositCommissionBalance: commissionAmount } },
        );

        await MfsDeposit.updateOne(
          { _id: deposit._id },
          {
            $set: {
              "calc.affiliateDepositCommission": {
                affiliatorId: String(affiliator._id),
                affiliatorUserId: String(affiliator.userId || ""),
                percent: pct,
                baseAmount: num(deposit.amount),
                commissionAmount,
              },
            },
          },
        );
      }
    }
  }

  const existingTurnover = await TurnOver.findOne({
    user: deposit.user,
    sourceType: "auto-personal-deposit",
    sourceId: deposit._id,
  });

  if (!existingTurnover) {
    await TurnOver.create({
      user: deposit.user,
      sourceType: "auto-personal-deposit",
      sourceId: deposit._id,
      required: targetTurnover,
      progress: 0,
      status: targetTurnover <= 0 ? "completed" : "running",
      creditedAmount,
      completedAt: targetTurnover <= 0 ? new Date() : null,
      eligibleProviders: deposit.selectedBonus?.eligibleProviders || [],
    });
  }

  return deposit;
}

/*
 * MFSWallet webhooks — /webhook/success|pending|reject/:key
 * payload: status, transaction_id, short_code, amount, method,
 * sender_number / message / reason, user_identyfy_address, checkout_items
 */
const WEBHOOK_STATUS = { success: "COMPLETED", pending: "PENDING", reject: "FAILED" };

router.post("/webhook/:kind/:key", async (req, res) => {
  try {
    const expected = WEBHOOK_STATUS[req.params.kind];
    if (!expected) return errorResponse(res, "Unknown webhook", 404);

    const body = req.body || {};
    const shortCode = text(body.short_code);
    const invoice = text(body.checkout_items?.invoice);

    if (!shortCode && !invoice) return errorResponse(res, "short_code is required", 400);

    const existing = await MfsDeposit.findOne(
      shortCode ? { shortCode } : { invoiceNumber: invoice },
    ).select("+callbackKey");

    // Unknown payment or wrong key — not a URL we handed out
    if (!existing || !sameKey(existing.callbackKey, req.params.key)) {
      return errorResponse(res, "Unknown payment", 404);
    }

    const status = text(body.status).toUpperCase() || expected;
    if (status !== expected) {
      return errorResponse(res, "Status does not match this webhook", 400);
    }

    // Amount and method must match our record (amount is required on success)
    const amount = money(body.amount);

    if (expected === "COMPLETED" && !(amount > 0)) {
      return errorResponse(res, "amount is required", 400);
    }
    if (amount > 0 && amount !== money(existing.amount)) {
      return errorResponse(res, "Amount mismatch", 400);
    }

    const method = text(body.method).toLowerCase();
    if (method && method !== existing.method) {
      return errorResponse(res, "Method mismatch", 400);
    }

    const transactionId = text(body.transaction_id).slice(0, 120);
    const info = {
      transactionId: /^(PENDING_VERIFICATION|INVALID)$/i.test(transactionId) ? "" : transactionId,
      senderNumber: text(body.sender_number).slice(0, 40),
      gatewayMessage: text(body.reason || body.message).slice(0, 300),
    };
    const filled = (patch) =>
      Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== ""));

    if (expected === "FAILED") {
      await MfsDeposit.updateOne(
        { _id: existing._id, status: "PENDING", balanceAdded: false },
        { $set: { status: "FAILED", needsReview: false, ...filled(info) } },
      );

      return successResponse(res, "Marked failed");
    }

    if (expected === "PENDING") {
      // The gateway could not match it — admin confirms or rejects by hand
      const marked = await MfsDeposit.updateOne(
        { _id: existing._id, status: "PENDING", balanceAdded: false, needsReview: false },
        { $set: { needsReview: true, ...filled(info) } },
      );

      // only the first time it needs review (a repeated webhook stays quiet)
      if (marked.modifiedCount) {
        notifyAdmin("mfs-review", {
          message: `${existing.userIdText} · ${taka(existing.amount)} · ${existing.method}${
            info.gatewayMessage ? ` · ${info.gatewayMessage}` : ""
          }`,
        });
      }

      return successResponse(res, "Pending recorded");
    }

    const deposit = await creditDeposit({ _id: existing._id }, filled(info));

    return successResponse(res, deposit ? "Deposit credited" : "Already handled");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

/* ----------------------------- ADMIN: CONFIRM / REJECT ----------------------------- */

router.post("/deposits/:id/confirm", protectAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) return errorResponse(res, "Bad id", 400);

    const deposit = await MfsDeposit.findById(req.params.id);

    if (!deposit) return errorResponse(res, "Deposit not found", 404);

    if (deposit.status !== "PENDING") {
      return errorResponse(res, "Only a pending deposit can be confirmed", 400);
    }

    const patch = {
      reviewedBy: req.admin?._id || null,
      reviewNote: text(req.body?.note).slice(0, 300),
    };

    const trx = text(req.body?.transactionId).slice(0, 120);
    if (trx) patch.transactionId = trx;

    const credited = await creditDeposit({ _id: deposit._id, status: "PENDING" }, patch);

    if (!credited) return errorResponse(res, "Already handled", 400);

    return successResponse(res, "Deposit confirmed and credited");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.post("/deposits/:id/reject", protectAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) return errorResponse(res, "Bad id", 400);

    const deposit = await MfsDeposit.findOneAndUpdate(
      { _id: req.params.id, status: "PENDING", balanceAdded: false },
      {
        $set: {
          status: "FAILED",
          needsReview: false,
          reviewedBy: req.admin?._id || null,
          reviewNote: text(req.body?.note).slice(0, 300),
        },
      },
      { returnDocument: "after" },
    );

    if (!deposit) {
      return errorResponse(res, "Only a pending deposit can be rejected", 400);
    }

    return successResponse(res, "Deposit rejected");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
