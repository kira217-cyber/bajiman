import express from "express";
import User from "../models/User.js";
import DepositRequest from "../models/DepositRequest.js";
import AutoDeposit from "../models/AutoDeposit.js";
import WithdrawRequest from "../models/WithdrawRequest.js";
import Game from "../models/Game.js";
import MfsDeposit from "../models/MfsDeposit.js";
import AutoWithdraw from "../models/AutoWithdraw.js";
import AffWithdrawRequest from "../models/AffWithdrawRequest.js";
import { protectAdmin } from "../middleware/protectAdmin.js";
import { successResponse, errorResponse } from "../utils/response.js";

const router = express.Router();

const num = (value = 0) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const sumField = async (Model, match = {}, field = "amount") => {
  const result = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: `$${field}` },
      },
    },
  ]);

  return num(result?.[0]?.total);
};

// Accepts "YYYY-MM-DD" (from the calendar) and returns that day's
// [start, end] bounds as a Bangladesh day (UTC+6) — the VPS clock may run
// in any timezone; defaults to today when no valid date is given.
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

const dayRange = (dateStr) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  const bdNow = new Date(Date.now() + BD_OFFSET_MS);

  const [y, m, d] = match
    ? [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
    : [bdNow.getUTCFullYear(), bdNow.getUTCMonth(), bdNow.getUTCDate()];

  const start = new Date(Date.UTC(y, m, d) - BD_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  const pad = (n) => String(n).padStart(2, "0");

  return { start, end, dateStr: `${y}-${pad(m + 1)}-${pad(d)}` };
};

// Money is counted on the day it really moved (approved / paid / completed)
const DONE = {
  manualDeposit: { Model: DepositRequest, match: { status: "approved" }, at: "approvedAt" },
  autoDeposit: { Model: AutoDeposit, match: { status: "PAID" }, at: "paidAt" },
  personalDeposit: { Model: MfsDeposit, match: { status: "PAID" }, at: "paidAt" },
  manualWithdraw: { Model: WithdrawRequest, match: { status: "approved" }, at: "approvedAt" },
  autoWithdraw: { Model: AutoWithdraw, match: { status: "COMPLETED" }, at: "completedAt" },
};

const doneTotal = async ({ Model, match, at }, range) => {
  const result = await Model.aggregate([
    { $match: { ...match, ...(range ? { [at]: { $gte: range.start, $lte: range.end } } : {}) } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  return { total: num(result?.[0]?.total), count: num(result?.[0]?.count) };
};

// Every money path, all time and for one day — the breakdown cards
const moneyBreakdown = async (range) => {
  const keys = Object.keys(DONE);
  const rows = await Promise.all(
    keys.map(async (key) => {
      const [all, day] = await Promise.all([doneTotal(DONE[key]), doneTotal(DONE[key], range)]);
      return [key, { total: all.total, count: all.count, today: day.total, todayCount: day.count }];
    }),
  );

  return Object.fromEntries(rows);
};

/*
 * Requests waiting for an admin, keyed by the sidebar menu key — used for
 * the sidebar badges, the top bar bell and the dashboard's "Waiting for you".
 * Auto deposit PENDING rows are mostly payment pages left open, so only the
 * ones the gateway sent details for are counted; personal auto deposit only
 * counts the ones the gateway could not match.
 */
const pendingCounts = async () => {
  const [deposit, autoDeposit, personalDeposit, withdraw, autoWithdraw, affWithdraw, affiliates] =
    await Promise.all([
      DepositRequest.countDocuments({ status: "pending" }),
      AutoDeposit.countDocuments({ status: "PENDING", transactionId: { $nin: ["", null] } }),
      MfsDeposit.countDocuments({ status: "PENDING", needsReview: true }),
      WithdrawRequest.countDocuments({ status: "pending" }),
      AutoWithdraw.countDocuments({ status: { $in: ["PENDING", "PROCESSING"] } }),
      AffWithdrawRequest.countDocuments({ status: "pending" }),
      // new affiliates stay inactive until an admin approves them
      User.countDocuments({ role: "aff-user", isActive: false }),
    ]);

  return {
    "deposit-requests": deposit,
    "auto-deposit-history": autoDeposit,
    "mfs-deposit-history": personalDeposit,
    "withdraw-requests": withdraw,
    "auto-withdraw-history": autoWithdraw,
    "aff-withdraw-requests": affWithdraw,
    "all-affiliate-users": affiliates,
  };
};

router.get("/pending", protectAdmin, async (req, res) => {
  try {
    const counts = await pendingCounts();
    res.set("Cache-Control", "no-store");

    return successResponse(res, "Pending counts loaded", {
      counts,
      total: Object.values(counts).reduce((sum, n) => sum + n, 0),
    });
  } catch (error) {
    return errorResponse(res, error.message || "Failed to load pending counts", 500);
  }
});

router.get("/summary", protectAdmin, async (req, res) => {
  try {
    const [
      allUsers,
      activeUsers,
      allAffiliateUsers,
      allGames,
      activeGames,

      pendingDepositRequest,
      pendingManualDepositAmount,
      approvedManualDepositAmount,

      pendingAutoDepositCount,
      approvedAutoDepositAmount,

      pendingWithdrawRequest,
      approvedWithdrawAmount,

      latestUsers,
      latestDeposits,
      latestAutoDeposits,
      latestWithdraws,

      breakdown,
      pending,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "user", isActive: true }),
      User.countDocuments({ role: "aff-user" }),

      Game.countDocuments({}),
      Game.countDocuments({ status: "active" }),

      DepositRequest.countDocuments({ status: "pending" }),
      sumField(DepositRequest, { status: "pending" }, "amount"),
      sumField(DepositRequest, { status: "approved" }, "amount"),

      AutoDeposit.countDocuments({ status: "PENDING" }),
      sumField(AutoDeposit, { status: "PAID" }, "amount"),

      WithdrawRequest.countDocuments({ status: "pending" }),
      sumField(WithdrawRequest, { status: "approved" }, "amount"),

      User.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("userId phone role isActive balance createdAt")
        .lean(),

      DepositRequest.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "userId phone")
        .select("user amount status createdAt")
        .lean(),

      AutoDeposit.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("userIdentity amount status invoiceNumber createdAt")
        .lean(),

      WithdrawRequest.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "userId phone")
        .select("user amount status createdAt")
        .lean(),

      moneyBreakdown(dayRange()),
      pendingCounts(),
    ]);

    const allDepositBalances =
      approvedManualDepositAmount +
      approvedAutoDepositAmount +
      breakdown.personalDeposit.total;
    const allWithdrawBalances = approvedWithdrawAmount + breakdown.autoWithdraw.total;
    const pendingDepositAll =
      pendingDepositRequest + pendingAutoDepositCount + pending["mfs-deposit-history"];
    const pendingWithdrawAll = pendingWithdrawRequest + pending["auto-withdraw-history"];

    const totalUsersForChart = allUsers;
    const inactiveUsers = Math.max(totalUsersForChart - activeUsers, 0);

    return successResponse(res, "Dashboard summary loaded", {
      cards: {
        allUsers,
        activeUsers,
        allAffiliateUsers,
        allDepositBalances,
        allGames,
        activeGames,
        allWithdrawBalances,
        pendingDepositRequest: pendingDepositAll,
        pendingWithdrawRequest: pendingWithdrawAll,
      },

      breakdown,
      pending,

      chart: {
        users: {
          active: activeUsers,
          inactive: inactiveUsers,
        },
        requests: {
          pendingDeposit: pendingDepositAll,
          pendingWithdraw: pendingWithdrawAll,
          approvedDepositAmount: allDepositBalances,
          approvedWithdrawAmount: allWithdrawBalances,
        },
      },

      latest: {
        users: latestUsers,
        deposits: [...latestDeposits, ...latestAutoDeposits]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5),
        withdraws: latestWithdraws,
      },

      totals: {
        pendingManualDepositAmount,
        approvedManualDepositAmount,
        approvedAutoDepositAmount,
        approvedWithdrawAmount,
      },
    });
  } catch (error) {
    console.error("DASHBOARD SUMMARY ERROR:", error);
    return errorResponse(
      res,
      error.message || "Failed to load dashboard summary",
      500,
    );
  }
});

/* Same 8 cards as /summary, but scoped to one calendar day (defaults to
   today). ?date=YYYY-MM-DD lets the dashboard's calendar re-fetch any
   past day's figures instead of always showing today's. */
router.get("/today", protectAdmin, async (req, res) => {
  try {
    const { start, end, dateStr } = dayRange(req.query.date);
    const createdAt = { $gte: start, $lte: end };

    const [
      allUsers,
      activeUsers,
      allAffiliateUsers,
      allGames,
      activeGames,

      pendingDepositRequest,
      pendingAutoDepositCount,
      pendingWithdrawRequest,
      pendingPersonalDeposit,
      pendingAutoWithdraw,

      dayMoney,
    ] = await Promise.all([
      User.countDocuments({ role: "user", createdAt }),
      User.countDocuments({ role: "user", isActive: true, createdAt }),
      User.countDocuments({ role: "aff-user", createdAt }),

      Game.countDocuments({ createdAt }),
      Game.countDocuments({ status: "active", createdAt }),

      DepositRequest.countDocuments({ status: "pending", createdAt }),
      AutoDeposit.countDocuments({ status: "PENDING", transactionId: { $nin: ["", null] }, createdAt }),
      WithdrawRequest.countDocuments({ status: "pending", createdAt }),
      MfsDeposit.countDocuments({ status: "PENDING", needsReview: true, createdAt }),
      AutoWithdraw.countDocuments({ status: { $in: ["PENDING", "PROCESSING"] }, createdAt }),

      Promise.all(Object.keys(DONE).map((key) => doneTotal(DONE[key], { start, end }))),
    ]);

    const day = Object.fromEntries(Object.keys(DONE).map((key, i) => [key, dayMoney[i].total]));
    const allDepositBalances = day.manualDeposit + day.autoDeposit + day.personalDeposit;

    return successResponse(res, "Dashboard today summary loaded", {
      date: dateStr,
      cards: {
        allUsers,
        activeUsers,
        allAffiliateUsers,
        allDepositBalances,
        allGames,
        activeGames,
        allWithdrawBalances: day.manualWithdraw + day.autoWithdraw,
        pendingDepositRequest:
          pendingDepositRequest + pendingAutoDepositCount + pendingPersonalDeposit,
        pendingWithdrawRequest: pendingWithdrawRequest + pendingAutoWithdraw,
      },
      money: day,
    });
  } catch (error) {
    console.error("DASHBOARD TODAY ERROR:", error);
    return errorResponse(
      res,
      error.message || "Failed to load dashboard today summary",
      500,
    );
  }
});

export default router;
