import express from "express";
import User from "../models/User.js";
import TurnOver from "../models/TurnOver.js";
import GameHistory from "../models/GameHistory.js";

const router = express.Router();

const toNum = (value = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const money = (value = 0) => {
  const n = toNum(value);
  return Math.trunc(n * 100) / 100;
};

const clean = (value = "") => String(value || "").trim();

const cleanMemberAccount = (value = "") => {
  let username = clean(value).toLowerCase();

  if (username.endsWith("orclegames")) {
    username = username.slice(0, -"orclegames".length);
  }

  if (username.endsWith("oraclegames")) {
    username = username.slice(0, -"oraclegames".length);
  }

  return username;
};

/* ----------------------------- TURNOVER PROGRESS ----------------------------- */
const applyTurnoverProgress = async ({ userId, wagerAmount }) => {
  const amt = money(wagerAmount);
  if (amt <= 0) return false;

  const turnovers = await TurnOver.find({
    user: userId,
    status: "running",
  }).sort({ createdAt: 1 });

  let remaining = amt;
  let applied = false;

  for (const turnover of turnovers) {
    if (remaining <= 0) break;

    const required = money(turnover.required);
    const progress = money(turnover.progress);
    const left = Math.max(0, money(required - progress));

    if (left <= 0) {
      await TurnOver.updateOne(
        { _id: turnover._id },
        {
          $set: {
            progress: required,
            status: "completed",
            completedAt: new Date(),
          },
        },
      );
      continue;
    }

    const add = money(Math.min(left, remaining));
    const newProgress = money(progress + add);
    const completed = newProgress >= required;

    await TurnOver.updateOne(
      { _id: turnover._id },
      {
        $inc: { progress: add },
        ...(completed
          ? {
              $set: {
                status: "completed",
                completedAt: new Date(),
              },
            }
          : {}),
      },
    );

    applied = true;
    remaining = money(remaining - add);
  }

  return applied;
};

/* ----------------------------- AFFILIATE COMMISSION ----------------------------- */
const applyAffiliateCommission = async ({ player, netAmount }) => {
  const empty = {
    affiliateUser: null,
    affiliateCommissionApplied: false,
    affiliateCommissionAmount: 0,
    affiliateCommissionType: "none",
  };

  if (!player?.referredBy) return empty;

  const affiliate = await User.findOne({
    _id: player.referredBy,
    role: "aff-user",
    isActive: true,
  });

  if (!affiliate) return empty;

  let commissionAmount = 0;
  let commissionType = "none";

  if (netAmount < 0) {
    const lossAmount = Math.abs(netAmount);
    const percent = toNum(affiliate.gameLossCommission);

    if (percent > 0) {
      commissionAmount = money((lossAmount * percent) / 100);
      commissionType = "game-loss";

      affiliate.gameLossCommissionBalance = money(
        toNum(affiliate.gameLossCommissionBalance) + commissionAmount,
      );
    }
  }

  if (netAmount > 0) {
    const winAmount = netAmount;
    const percent = toNum(affiliate.gameWinCommission);

    if (percent > 0) {
      commissionAmount = money((winAmount * percent) / 100);
      commissionType = "game-win";

      affiliate.gameWinCommissionBalance = money(
        toNum(affiliate.gameWinCommissionBalance) + commissionAmount,
      );
    }
  }

  if (commissionAmount <= 0) {
    return {
      affiliateUser: affiliate._id,
      affiliateCommissionApplied: false,
      affiliateCommissionAmount: 0,
      affiliateCommissionType: "none",
    };
  }

  affiliate.commissionBalance = money(
    toNum(affiliate.commissionBalance) + commissionAmount,
  );

  await affiliate.save();

  return {
    affiliateUser: affiliate._id,
    affiliateCommissionApplied: true,
    affiliateCommissionAmount: commissionAmount,
    affiliateCommissionType: commissionType,
  };
};

/* ----------------------------- ORACLE CALLBACK ----------------------------- */
router.post("/", async (req, res) => {
  try {
    const {
      game_uid,
      game_round,
      bet_amount,
      serial_number,
      win_amount,
      member_account,
      currency_code,
      timestamp,
    } = req.body || {};

    if (
      !game_uid ||
      !game_round ||
      !serial_number ||
      bet_amount === undefined ||
      win_amount === undefined ||
      !member_account
    ) {
      return res.status(200).json({
        success: false,
        balance: 0,
        message: "Missing required fields",
      });
    }

    const gameUId = clean(game_uid);
    const gameRound = clean(game_round);
    const serialNumber = clean(serial_number);
    const rawMemberAccount = clean(member_account);
    const userGamePlayName = cleanMemberAccount(member_account);

    const betAmount = money(bet_amount);
    const winAmount = money(win_amount);

    if (betAmount < 0 || winAmount < 0) {
      return res.status(200).json({
        success: false,
        balance: 0,
        message: "Invalid amount",
      });
    }

    const duplicate = await GameHistory.findOne({
      serial_number: serialNumber,
    }).lean();

    if (duplicate) {
      return res.status(200).json({
        success: false,
        balance: duplicate.balance_after || 0,
        message: "DUPLICATE",
        data: {
          status: "DUPLICATE",
          balance: duplicate.balance_after || 0,
          game_round: gameRound,
          serial_number: serialNumber,
        },
      });
    }

    const player = await User.findOne({
      userGamePlayName,
      isActive: true,
    });

    if (!player) {
      return res.status(200).json({
        success: false,
        balance: 0,
        message: "USER_NOT_FOUND",
        data: {
          member_account: rawMemberAccount,
          userGamePlayName,
        },
      });
    }

    const currentBalance = money(player.balance || 0);

    if (currentBalance < betAmount) {
      return res.status(200).json({
        success: false,
        balance: currentBalance,
        message: "INSUFFICIENT_BALANCE",
        data: {
          status: "INSUFFICIENT_BALANCE",
          currentBalance,
          betAmount,
          game_round: gameRound,
          serial_number: serialNumber,
        },
      });
    }

    const netAmount = money(winAmount - betAmount);

    let resultType = "push";
    if (netAmount > 0) resultType = "win";
    if (netAmount < 0) resultType = "loss";

    const newBalance = money(currentBalance - betAmount + winAmount);

    const updatedPlayer = await User.findByIdAndUpdate(
      player._id,
      { $set: { balance: newBalance } },
      { returnDocument: "after" },
    );

    const finalBalance = money(updatedPlayer?.balance || 0);

    const turnoverApplied =
      betAmount > 0
        ? await applyTurnoverProgress({
            userId: player._id,
            wagerAmount: betAmount,
          })
        : false;

    const affiliateResult = await applyAffiliateCommission({
      player,
      netAmount,
    });

    const history = await GameHistory.create({
      user: player._id,
      userId: player.userId,
      userGamePlayName: player.userGamePlayName,
      member_account: rawMemberAccount,
      phone: `${player.countryCode || ""}${player.phone || ""}`,
      email: player.email || "",
      currency: currency_code || player.currency || "BDT",
      userRole: player.role || "user",

      game_uid: gameUId,
      game_round: gameRound,
      serial_number: serialNumber,

      bet_amount: betAmount,
      win_amount: winAmount,
      net_amount: netAmount,
      resultType,

      balance_before: currentBalance,
      balance_after: finalBalance,

      turnoverApplied,

      affiliateUser: affiliateResult.affiliateUser,
      affiliateCommissionApplied: affiliateResult.affiliateCommissionApplied,
      affiliateCommissionAmount: affiliateResult.affiliateCommissionAmount,
      affiliateCommissionType: affiliateResult.affiliateCommissionType,

      oracleTimestamp: clean(timestamp),
      rawPayload: req.body || {},
    });

    return res.status(200).json({
      success: true,
      balance: finalBalance,
      message: "SUCCESS",
      data: {
        status: "SUCCESS",
        resultType,
        betAmount,
        winAmount,
        netAmount,
        balanceBefore: currentBalance,
        newBalance: finalBalance,
        turnoverApplied,
        affiliateCommissionApplied: affiliateResult.affiliateCommissionApplied,
        affiliateCommissionAmount: affiliateResult.affiliateCommissionAmount,
        affiliateCommissionType: affiliateResult.affiliateCommissionType,
        game_round: gameRound,
        serial_number: serialNumber,
        historyId: history._id,
      },
    });
  } catch (error) {
    console.error("GAME CALLBACK ERROR:", error);

    if (error?.code === 11000) {
      return res.status(200).json({
        success: false,
        balance: 0,
        message: "DUPLICATE",
        data: { status: "DUPLICATE" },
      });
    }

    return res.status(200).json({
      success: false,
      balance: 0,
      message: "Internal processing error, but acknowledged",
    });
  }
});

export default router;
