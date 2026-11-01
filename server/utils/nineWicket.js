import crypto from "node:crypto";

import GameHistory from "../models/GameHistory.js";
import NineWicketSetting, { NINE_WICKET_CODE, NINE_WICKET_DEFAULT_UID } from "../models/NineWicketSetting.js";
import NineWicketWallet from "../models/NineWicketWallet.js";
import User from "../models/User.js";
import { ORACLE_LAUNCH_KEY } from "./oracleLaunch.js";

/*
 * 9 Wicket — a transfer wallet (as in Raza7 / Bir75).
 *
 *   open:     the player's whole-taka balance is taken from the main balance
 *             in one step, then sent to `transferUrl`; refunded if refused.
 *   callback: the main balance is not touched — only history, exposure and
 *             turnover.
 *   return:   on a balance refresh (/api/user-info) whatever is left in
 *             9 Wicket (`balanceUrl`) comes back to the main balance.
 *
 * Every send/return is kept in NineWicketWallet.
 */

const TIMEOUT_MS = 30000;
// Do not wait long when bringing money back — the refresh is waiting
const BALANCE_TIMEOUT_MS = 8000;
const SETTING_TTL_MS = 15000;

const text = (value) => String(value ?? "").trim();
export const nwMoney = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.trunc(n * 100) / 100 : 0;
};

/* -- setting (read often by callbacks and the game list — cached 15 seconds) -- */

let settingCache = { value: null, at: 0 };

export const loadNineWicketSetting = async (fresh = false) => {
  if (!fresh && settingCache.value && Date.now() - settingCache.at < SETTING_TTL_MS) return settingCache.value;
  const setting = await NineWicketSetting.current();
  settingCache = { value: setting.toObject(), at: Date.now() };
  return settingCache.value;
};

export const forgetNineWicketSetting = () => {
  settingCache = { value: null, at: 0 };
};

/** Is this uid 9 Wicket's — even while off (old bets can still call back) */
export const isNineWicketUid = async (gameUId) => {
  const uid = text(gameUId);
  if (!uid) return false;
  if (uid === NINE_WICKET_DEFAULT_UID) return true;
  const setting = await loadNineWicketSetting();
  return uid === text(setting?.gameUId);
};

/** From the cached setting, instantly (callbacks are in a hurry) */
export const peekNineWicketUid = () => text(settingCache.value?.gameUId) || NINE_WICKET_DEFAULT_UID;

const publicBase = (req) =>
  text(process.env.PUBLIC_BACKEND_URL).replace(/\/+$/, "") || (req ? `${req.protocol}://${req.get("host")}` : "");

const imageOf = (setting, req) => {
  const image = text(setting?.image);
  if (!image) return "";
  return /^https?:\/\//i.test(image) ? image : `${publicBase(req)}${image.startsWith("/") ? "" : "/"}${image}`;
};

/**
 * The Sports row entry — same shape as a Sport document from game-data
 * (`gameId` = game_uid, clicking opens /play-game/<gameId>).
 */
export const nineWicketSport = (setting, req) => {
  const en = text(setting.name?.en) || "9 Wicket";
  return {
    _id: "nine-wicket",
    id: "nine-wicket",
    name: { bn: text(setting.name?.bn) || en, en },
    gameId: text(setting.gameUId) || NINE_WICKET_DEFAULT_UID,
    iconImageUrl: imageOf(setting, req),
    isActive: true,
    order: Number(setting.position) || 0,
    provider: "ninewicket",
  };
};

/**
 * Add 9 Wicket to a Sports list while it is on (admin › 9 Wicket), at its
 * chosen position. Used by the White-label game-data proxy (what the client
 * reads) and the site's own catalog route.
 */
export const withNineWicketSports = async (req, sports) => {
  const list = Array.isArray(sports) ? sports : [];
  const setting = await loadNineWicketSetting().catch(() => null);
  if (!setting?.active) return list;

  const entry = nineWicketSport(setting, req);
  const rest = list.filter((item) => String(item?.gameId || "") !== entry.gameId);
  const at = Math.min(Math.max(0, Number(setting.position) || 0), rest.length);

  return [...rest.slice(0, at), entry, ...rest.slice(at)];
};

/** Name/code — for history and turnover provider rules */
export const nineWicketInfo = (setting = settingCache.value) => ({
  name: text(setting?.name?.en) || "9 Wicket",
  nameBn: text(setting?.name?.bn),
  code: NINE_WICKET_CODE,
  category: text(setting?.categoryKey) || "sports",
});

/* -- the player's 6-letter 9 Wicket name -- */

const randomLetters = (length) => {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += letters[bytes[i] % letters.length];
  return out;
};

export const ensureNineWicketUsername = async (user) => {
  const current = text(user.nineWicketUsername).toLowerCase();
  if (/^[a-z]{6}$/.test(current)) return current;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const name = randomLetters(6);
    if (await User.exists({ nineWicketUsername: name })) continue;
    // conditional — opening twice at once still sets one name
    const updated = await User.findOneAndUpdate(
      { _id: user._id, $or: [{ nineWicketUsername: null }, { nineWicketUsername: { $exists: false } }] },
      { $set: { nineWicketUsername: name } },
      { returnDocument: "after" },
    ).catch((error) => (error?.code === 11000 ? null : Promise.reject(error)));
    if (updated?.nineWicketUsername) return updated.nineWicketUsername;
    const again = await User.findById(user._id).select("nineWicketUsername").lean();
    if (/^[a-z]{6}$/.test(text(again?.nineWicketUsername))) return again.nineWicketUsername;
  }
  throw new Error("Could not create a 9 Wicket username");
};

/** callback `member_account` -> our 6-letter name (suffix removed) */
export const nineWicketNameOf = (memberAccount) => {
  let name = text(memberAccount).toLowerCase();
  for (const suffix of ["orclegames", "oraclegames"]) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  return /^[a-z]{6}/.test(name) ? name.slice(0, 6) : "";
};

/* -- main balance -- */

/** Add to the main balance in one step (never lost to a parallel callback) */
const creditUser = (userId, amount) =>
  User.findOneAndUpdate(
    { _id: userId },
    [{ $set: { balance: { $round: [{ $add: [{ $ifNull: ["$balance", 0] }, amount] }, 2] } } }],
    { returnDocument: "after", updatePipeline: true },
  ).select("balance");

/* ── Oracle ── */

// Same Oracle key the other games launch with
const launchKeyOf = async () => text(ORACLE_LAUNCH_KEY);

const post = async (url, body, key, timeout = TIMEOUT_MS) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-oracle-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const launchUrlOf = (data) =>
  data?.launch_url || data?.launchUrl || data?.gameUrl || data?.game_url || data?.url ||
  data?.data?.launch_url || data?.data?.launchUrl || data?.data?.gameUrl || data?.data?.game_url || data?.data?.url || "";

/**
 * Open 9 Wicket — take the money first, then send it.
 * Returns: `{ launchUrl, amount, balance }` or `{ error, status }`
 */
const launching = new Set();

export const launchNineWicket = async (user) => {
  // one open at a time per player (double click, two tabs)
  const id = String(user._id);
  if (launching.has(id)) return { error: "launchBusy", status: 429, message: "Game is already opening, please wait" };
  launching.add(id);
  try {
    return await launchOnce(user);
  } finally {
    launching.delete(id);
  }
};

const launchOnce = async (user) => {
  const setting = await loadNineWicketSetting(true);
  if (!setting.active) return { error: "gameNotFound", status: 404 };

  const key = await launchKeyOf();
  if (!key) return { error: "gameNotReady", status: 503 };

  const username = await ensureNineWicketUsername(user);

  // bring back anything left from last time first — then send it all together
  await syncNineWicketBalance(user._id, { force: true }).catch(() => null);

  // whole taka only — the decimal part stays on the site
  const fresh = await User.findById(user._id).select("balance isActive").lean();
  const amount = Math.floor(Math.max(0, Number(fresh?.balance) || 0));
  if (!fresh?.isActive) return { error: "accountDisabled", status: 403 };
  if (amount < 1) return { error: "lowBalance", status: 400 };

  // taken in one step — nothing if not enough (even from two tabs at once)
  const reserved = await User.findOneAndUpdate(
    { _id: user._id, isActive: true, balance: { $gte: amount } },
    [{ $set: { balance: { $round: [{ $subtract: ["$balance", amount] }, 2] } } }],
    { returnDocument: "after", updatePipeline: true },
  ).select("balance");
  if (!reserved) return { error: "balanceChanged", status: 409 };

  const refund = async (reason) => {
    await creditUser(user._id, amount);
    console.error("9 Wicket transfer failed, refunded:", reason);
  };

  let response;
  try {
    response = await post(setting.transferUrl, { username, amount }, key);
  } catch (error) {
    await refund(error.message);
    await NineWicketSetting.updateOne({ key: "main" }, { $set: { lastError: String(error.message).slice(0, 300) } });
    return { error: "gameLaunchFailed", status: 502 };
  }

  const launchUrl = launchUrlOf(response.data);
  if (Number(response.data?.transfer_status) !== 1 || !launchUrl) {
    await refund(JSON.stringify(response.data).slice(0, 300));
    await NineWicketSetting.updateOne(
      { key: "main" },
      { $set: { lastError: text(response.data?.message || `Transfer failed (${response.status})`).slice(0, 300) } },
    );
    return { error: "gameLaunchFailed", status: 502, message: text(response.data?.message) };
  }

  // 9 Wicket has it now — no refund from here on
  await NineWicketWallet.findOneAndUpdate(
    { user: user._id },
    {
      $set: { username, lastTransferAmount: amount, lastTransferAt: new Date(), lastSyncAt: new Date(), status: "playing" },
      $inc: { totalTransferred: amount },
      $setOnInsert: { totalReturned: 0, exposureBalance: 0, lastReturnedAmount: 0 },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch((error) => console.error("9 Wicket wallet update failed:", error.message));

  if (setting.lastError) await NineWicketSetting.updateOne({ key: "main" }, { $set: { lastError: "" } });

  return { launchUrl, amount, balance: nwMoney(reserved.balance), username };
};

/* -- bringing money back -- */

const syncing = new Map();
// at most one Oracle call per player every 8 seconds (unless `force`)
const lastAsked = new Map();
const ASK_GAP_MS = 8000;
// do not pull just-sent money straight back — the game page needs time to open,
// and a refresh in another tab would bring it back before play even started
const AFTER_TRANSFER_MS = 15000;

/**
 * Whatever is left in 9 Wicket goes back to the main balance.
 * Parallel requests for one player share a single Oracle call.
 * Never throws; returns `{ added, exposure }`.
 */
export const syncNineWicketBalance = async (userId, { force = false } = {}) => {
  const id = String(userId);
  if (syncing.has(id)) return syncing.get(id);

  const job = (async () => {
    const wallet = await NineWicketWallet.findOne({ user: userId });
    // never played — no need to ask Oracle
    if (!wallet) return { added: 0, exposure: 0 };

    const exposure = Math.max(0, nwMoney(wallet.exposureBalance));
    // money already brought back and nothing open — do not ask again
    if (!force && wallet.status === "settled" && exposure === 0) return { added: 0, exposure };
    if (!force && wallet.status === "idle") return { added: 0, exposure };

    if (!force && Date.now() - (lastAsked.get(id) || 0) < ASK_GAP_MS) return { added: 0, exposure };
    if (!force && wallet.lastTransferAt && Date.now() - new Date(wallet.lastTransferAt).getTime() < AFTER_TRANSFER_MS) {
      return { added: 0, exposure };
    }
    lastAsked.set(id, Date.now());
    if (lastAsked.size > 5000) lastAsked.delete(lastAsked.keys().next().value);

    const [setting, key] = await Promise.all([loadNineWicketSetting(), launchKeyOf()]);
    if (!key || !wallet.username) return { added: 0, exposure };
    // switched off in admin: no Oracle call on refresh (opening and "Return now" use `force`)
    if (!force && (!setting.active || setting.autoReturn === false)) return { added: 0, exposure };

    const { data } = await post(setting.balanceUrl, { username: wallet.username }, key, BALANCE_TIMEOUT_MS);
    if (Number(data?.transfer_status) !== 1) return { added: 0, exposure };

    const amount = Math.max(0, nwMoney(data?.get_amount));
    let balance = null;
    if (amount > 0) {
      const credited = await creditUser(userId, amount);
      balance = credited?.balance;
    }

    // exposure is changed by callbacks only — here only the return
    const latest = await NineWicketWallet.findOne({ user: userId }).select("exposureBalance status").lean();
    const nowExposure = Math.max(0, nwMoney(latest?.exposureBalance));
    const status = nowExposure > 0 ? "exposure" : amount > 0 ? "settled" : latest?.status === "playing" ? "playing" : "settled";
    await NineWicketWallet.updateOne(
      { user: userId },
      {
        $set: { lastReturnedAmount: amount, lastSyncAt: new Date(), status },
        ...(amount > 0 ? { $inc: { totalReturned: amount } } : {}),
      },
    );
    return { added: amount, exposure: nowExposure, balance };
  })()
    .catch((error) => {
      console.error("9 Wicket balance sync failed:", error.message);
      return { added: 0, exposure: 0 };
    })
    .finally(() => syncing.delete(id));

  syncing.set(id, job);
  return job;
};

/* -- callback -- */

/**
 * exposure (RB777 rule):
 *   bet (bet > 0, win = 0): a newer bet in the same round replaces the older stake
 *   settle (bet = 0): the stake is removed
 * never below 0.
 */
export const applyNineWicketExposure = async ({ userId, username, gameRound, betAmount, winAmount, matchStake }) => {
  const stake = Math.max(0, nwMoney(matchStake));
  const wallet =
    (await NineWicketWallet.findOne({ user: userId })) ||
    (await NineWicketWallet.create({ user: userId, username, status: "idle", lastSyncAt: new Date() }));

  const current = Math.max(0, nwMoney(wallet.exposureBalance));
  let previous = 0;
  let change = 0;
  let after = current;
  let action = "none";

  if (betAmount > 0 && winAmount === 0 && stake > 0) {
    const prev = await GameHistory.findOne({
      user: userId,
      providerCode: NINE_WICKET_CODE,
      // Bajiman's history uses snake_case money/round fields
      game_round: gameRound,
      bet_amount: { $gt: 0 },
      win_amount: 0,
    })
      .sort({ createdAt: -1 })
      .select("matchStake")
      .lean();
    previous = Math.max(0, nwMoney(prev?.matchStake));
    change = nwMoney(stake - previous);
    after = Math.max(0, nwMoney(current - previous + stake));
    action = previous > 0 ? "replace_same_round" : "add_new_round";
  } else if (betAmount === 0 && stake > 0) {
    change = -stake;
    after = Math.max(0, nwMoney(current - stake));
    action = winAmount > 0 ? "subtract_settlement" : "subtract_zero_win";
  }

  wallet.username = username;
  wallet.exposureBalance = after;
  wallet.lastSyncAt = new Date();
  // after settling the money is still in 9 Wicket — "settled" only after it is
  // brought back (syncNineWicketBalance); otherwise winnings would stay stuck there
  if (after > 0) wallet.status = "exposure";
  else if (action !== "none") wallet.status = "playing";
  await wallet.save();

  return { previous, change, after, action };
};

/** The player's current exposure (shown next to the balance) */
export const exposureOf = async (userId) => {
  const wallet = await NineWicketWallet.findOne({ user: userId }).select("exposureBalance").lean();
  return Math.max(0, nwMoney(wallet?.exposureBalance));
};
