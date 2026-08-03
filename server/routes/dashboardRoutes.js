import express from "express";
import User from "../models/User.js";
import DepositRequest from "../models/DepositRequest.js";
import AutoDeposit from "../models/AutoDeposit.js";
import WithdrawRequest from "../models/WithdrawRequest.js";
import Game from "../models/Game.js";
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
    ]);

    const allDepositBalances =
      approvedManualDepositAmount + approvedAutoDepositAmount;

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
        allWithdrawBalances: approvedWithdrawAmount,
        pendingDepositRequest: pendingDepositRequest + pendingAutoDepositCount,
        pendingWithdrawRequest,
      },

      chart: {
        users: {
          active: activeUsers,
          inactive: inactiveUsers,
        },
        requests: {
          pendingDeposit: pendingDepositRequest + pendingAutoDepositCount,
          pendingWithdraw: pendingWithdrawRequest,
          approvedDepositAmount: allDepositBalances,
          approvedWithdrawAmount,
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

export default router;
