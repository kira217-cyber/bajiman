import AdminNotifySetting from "../models/AdminNotifySetting.js";

/*
 * Push to the site owner's phone — Notification App (adminnoti.oraclesoft.online).
 *
 *   notifyAdmin("deposit-request", { message: "user1 · ৳500 · bKash" })
 *
 * Sending runs in the background: the caller never waits, and a down
 * notification server never blocks a player's deposit or login — the error
 * only shows on the admin page.
 */

/** Every event — the admin page builds its rows from this list */
export const NOTIFY_EVENTS = [
  { key: "deposit-request", group: "Deposit", label: "Manual deposit request", title: "নতুন ডিপোজিট রিকোয়েস্ট", path: "/deposit-requests", priority: "important" },
  { key: "auto-deposit", group: "Deposit", label: "Auto deposit (paid)", title: "অটো ডিপোজিট সফল", path: "/auto-deposit-history", priority: "normal" },
  { key: "mfs-deposit", group: "Deposit", label: "Personal auto deposit (paid)", title: "পার্সোনাল অটো ডিপোজিট সফল", path: "/mfs-deposit-history", priority: "normal" },
  { key: "mfs-review", group: "Deposit", label: "Personal auto deposit needs review", title: "পার্সোনাল অটো ডিপোজিট — যাচাই লাগবে", path: "/mfs-deposit-history", priority: "important" },
  { key: "withdraw-request", group: "Withdraw", label: "Manual withdraw request", title: "নতুন উত্তোলন রিকোয়েস্ট", path: "/withdraw-requests", priority: "important" },
  { key: "auto-withdraw", group: "Withdraw", label: "Auto withdraw request", title: "অটো উত্তোলন — অনুমোদন লাগবে", path: "/auto-withdraw-history", priority: "important" },
  { key: "aff-withdraw", group: "Withdraw", label: "Affiliate withdraw request", title: "অ্যাফিলিয়েট উত্তোলন রিকোয়েস্ট", path: "/aff-withdraw-requests", priority: "important" },
  { key: "user-register", group: "User", label: "User register", title: "নতুন ইউজার রেজিস্টার", path: "/all-users", priority: "normal" },
  { key: "user-login", group: "User", label: "User login", title: "ইউজার লগইন", path: "/all-users", priority: "silent" },
  { key: "affiliate-register", group: "Affiliate", label: "Affiliate register", title: "নতুন অ্যাফিলিয়েট আবেদন", path: "/all-affiliate-users", priority: "normal" },
  { key: "affiliate-login", group: "Affiliate", label: "Affiliate login", title: "অ্যাফিলিয়েট লগইন", path: "/all-affiliate-users", priority: "silent" },
];

const EVENT_MAP = new Map(NOTIFY_EVENTS.map((e) => [e.key, e]));
export const PRIORITIES = ["important", "normal", "silent"];

const text = (v) => String(v ?? "").trim();
const trimSlash = (v) => text(v).replace(/\/+$/, "");

/** An event's setting — the default when nothing is saved */
export const eventConfig = (setting, key) => {
  const base = EVENT_MAP.get(key);
  const saved = setting?.events?.get?.(key) || setting?.events?.[key] || {};
  return {
    enabled: typeof saved.enabled === "boolean" ? saved.enabled : true,
    priority: PRIORITIES.includes(saved.priority) ? saved.priority : base?.priority || "normal",
    url: text(saved.url),
  };
};

/** The address a tapped notification opens */
export const actionUrlOf = (setting, key, path) => {
  const custom = eventConfig(setting, key).url;
  if (custom) return custom;
  const root = trimSlash(setting?.adminUrl) || trimSlash(process.env.PUBLIC_ADMIN_URL);
  if (!root) return "";
  return `${root}${path || EVENT_MAP.get(key)?.path || "/"}`;
};

/* -- setting cache (so a login does not read the DB every time) -- */
let cache = { value: null, at: 0 };
const loadSetting = async () => {
  if (cache.value && Date.now() - cache.at < 15000) return cache.value;
  const value = await AdminNotifySetting.current({ withKey: true });
  cache = { value, at: Date.now() };
  return value;
};
export const forgetNotifySetting = () => {
  cache = { value: null, at: 0 };
};

/** Send directly — used by the test buttons, returns the result */
export const sendNotice = async (setting, { title, message, priority = "normal", actionUrl = "", imageUrl = "" }) => {
  const base = trimSlash(setting.apiBase);
  if (!base || !setting.apiKey) throw new Error("API key is not set");
  if (!setting.companyId && !setting.phone) throw new Error("Notification account (phone) is not set");

  const target = setting.companyId ? { companyId: setting.companyId } : { phone: setting.phone };
  const response = await fetch(`${base}/api/v1/notices/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": setting.apiKey },
    body: JSON.stringify({
      ...target,
      title: text(title).slice(0, 120),
      message: text(message).slice(0, 500),
      priority,
      ...(actionUrl ? { actionUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.message || `Notification server answered ${response.status}`);
  return body;
};

const note = (update) => AdminNotifySetting.updateOne({ key: "main" }, update).catch(() => {});

/**
 * Call when something happens — never throws, never makes the caller wait.
 * `path` opens that admin page (e.g. the player's own page).
 */
export const notifyAdmin = (key, { title, message = "", path = "" } = {}) => {
  const event = EVENT_MAP.get(key);
  if (!event) return;

  setImmediate(async () => {
    try {
      const setting = await loadSetting();
      if (!setting?.active) return;
      const config = eventConfig(setting, key);
      if (!config.enabled) return;

      await sendNotice(setting, {
        title: title || event.title,
        message,
        priority: config.priority,
        actionUrl: actionUrlOf(setting, key, path),
      });
      await note({ $inc: { sentCount: 1 }, $set: { lastSentAt: new Date() } });
    } catch (error) {
      await note({ $set: { lastError: `${key}: ${error.message}`.slice(0, 300), lastErrorAt: new Date() } });
    }
  });
};

/** "৳1,250" */
export const taka = (n) => `৳${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
