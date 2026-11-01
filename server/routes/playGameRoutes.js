import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { ORACLE_GAME_LAUNCH_URL, ORACLE_LAUNCH_KEY } from "../utils/oracleLaunch.js";
import { isNineWicketUid, launchNineWicket } from "../utils/nineWicket.js";

const router = express.Router();

const requireAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const id =
      decoded?.id ||
      decoded?._id ||
      decoded?.userId ||
      decoded?.user?._id ||
      decoded?.user?.id;

    if (!id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    req.user = { id };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

const makeGamePlayName = () => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(10);
  let name = "";

  for (let i = 0; i < 10; i += 1) {
    name += letters[bytes[i] % letters.length];
  }

  return name;
};

const isValidGamePlayName = (value = "") =>
  /^[a-z]{10}$/.test(String(value || "").trim());

const getOrCreateGamePlayName = async (user) => {
  if (isValidGamePlayName(user.userGamePlayName)) {
    return String(user.userGamePlayName).trim();
  }

  for (let i = 0; i < 50; i += 1) {
    const name = makeGamePlayName();
    const exists = await User.exists({ userGamePlayName: name });

    if (!exists) {
      user.userGamePlayName = name;
      await user.save();
      return name;
    }
  }

  throw new Error("Failed to generate unique game play username");
};

const extractLaunchUrl = (responseData) => {
  return (
    responseData?.launch_url ||
    responseData?.launchUrl ||
    responseData?.gameUrl ||
    responseData?.url ||
    responseData?.data?.launch_url ||
    responseData?.data?.launchUrl ||
    responseData?.data?.gameUrl ||
    responseData?.data?.url ||
    ""
  );
};

router.post("/playgame", requireAuth, async (req, res) => {
  try {
    const { gameID, game_uid, gameId } = req.body || {};
    const gameUId = String(game_uid || gameID || gameId || "").trim();

    if (!gameUId) {
      return res.status(400).json({
        success: false,
        message: "game_uid is required",
      });
    }

    // 9 Wicket — transfer wallet: the whole balance is sent, then it opens
    if (await isNineWicketUid(gameUId)) {
      const result = await launchNineWicket({ _id: req.user?.id });

      if (result.error) {
        const messages = {
          lowBalance: "No balance, please deposit",
          balanceChanged: "Balance changed while opening the game. Please try again.",
          launchBusy: "Game is already opening, please wait",
          gameNotReady: "Game launch is not ready",
          gameNotFound: "Game not found",
          accountDisabled: "Your account is not active",
        };

        return res.status(result.status || 400).json({
          success: false,
          code: result.error,
          message: messages[result.error] || result.message || "Failed to launch game",
        });
      }

      return res.json({
        success: true,
        gameUrl: result.launchUrl,
        launch_url: result.launchUrl,
        // the client opens it in this tab, not in the iframe
        provider: "ninewicket",
        openType: "same_tab",
        data: {
          launch_url: result.launchUrl,
          gameUrl: result.launchUrl,
          game_uid: gameUId,
          balance: result.balance,
          transferred: result.amount,
        },
      });
    }

    const user = await User.findById(req.user?.id).select(
      "userId phone balance isActive currency userGamePlayName",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isActive !== true) {
      return res.status(403).json({
        success: false,
        message: "Your account is not active",
      });
    }

    let balance = Number(user.balance ?? 0);

    if (!Number.isFinite(balance) || balance < 0) {
      balance = 0;
    }

    if (!ORACLE_LAUNCH_KEY) {
      return res.status(500).json({
        success: false,
        message: "ORACLE_LAUNCH_KEY missing",
      });
    }

    const userGamePlayName = await getOrCreateGamePlayName(user);

    const payload = {
      amount: String(Math.max(0, Math.floor(balance))),
      username: userGamePlayName,
      game_uid: gameUId,
    };

    const response = await axios.post(ORACLE_GAME_LAUNCH_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-oracle-key": ORACLE_LAUNCH_KEY,
      },
      timeout: 30000,
    });

    const gameUrl = extractLaunchUrl(response.data);

    if (!gameUrl || typeof gameUrl !== "string") {
      return res.status(502).json({
        success: false,
        message: "No launch_url received from Oracle API",
        error: response.data,
      });
    }

    return res.json({
      success: true,
      gameUrl,
      launch_url: gameUrl,
      data: {
        launch_url: gameUrl,
        gameUrl,
        game_uid: gameUId,
        username: userGamePlayName,
        amount: payload.amount,
      },
      used: {
        game_uid: gameUId,
        username: userGamePlayName,
        amount: payload.amount,
      },
    });
  } catch (error) {
    console.error("PlayGame API Error:", error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error?.response?.data?.message ||
        error.message ||
        "Failed to launch game",
      error: error.response?.data || error.message,
    });
  }
});

export default router;
