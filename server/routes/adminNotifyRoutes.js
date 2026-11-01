import crypto from "node:crypto";
import express from "express";

import AdminNotifySetting from "../models/AdminNotifySetting.js";
import { protectAdmin, requireMother } from "../middleware/protectAdmin.js";
import { successResponse, errorResponse } from "../utils/response.js";
import { NOTIFY_EVENTS, PRIORITIES, actionUrlOf, eventConfig, forgetNotifySetting, sendNotice } from "../utils/adminNotify.js";

/*
 * Notification App — admin › Notification App, /api/admin-notify
 *   GET/PUT /admin       on/off, API key, the app's phone + PIN, per-event on/off, sound, link
 *   POST /admin/test     send one test notification
 *   POST /admin/company  create this site's Company (phone + PIN) on the notification system
 */
const router = express.Router();

const text = (v) => String(v ?? "").trim();
const isUrl = (v) => /^https?:\/\/[^\s]+$/i.test(v);
const isPhone = (v) => /^01\d{9}$/.test(v);
const isPin = (v) => /^\d{4,8}$/.test(v);

const view = (setting) => {
  const plain = setting.toObject();
  delete plain.apiKey;
  return {
    setting: {
      ...plain,
      events: undefined,
      hasKey: Boolean(setting.apiKey),
      keyPreview: setting.apiKey ? `${setting.apiKey.slice(0, 6)}…${setting.apiKey.slice(-4)}` : "",
    },
    events: NOTIFY_EVENTS.map((event) => ({
      ...event,
      ...eventConfig(setting, event.key),
      link: actionUrlOf(setting, event.key),
    })),
    priorities: PRIORITIES,
    defaultAdminUrl: text(process.env.PUBLIC_ADMIN_URL),
  };
};

router.get("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await AdminNotifySetting.current({ withKey: true });
    return successResponse(res, "Notification setting loaded", view(setting));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

router.put("/admin", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await AdminNotifySetting.current({ withKey: true });
    const body = req.body || {};

    if (body.apiKey !== undefined && text(body.apiKey)) setting.apiKey = text(body.apiKey);
    if (body.clearKey === true) setting.apiKey = "";
    if (body.apiBase !== undefined) {
      const base = text(body.apiBase).replace(/\/+$/, "");
      if (!isUrl(base)) return errorResponse(res, "API URL must start with https://", 400);
      setting.apiBase = base;
    }
    if (body.adminUrl !== undefined) {
      const url = text(body.adminUrl).replace(/\/+$/, "");
      if (url && !isUrl(url)) return errorResponse(res, "Admin URL must start with https://", 400);
      setting.adminUrl = url;
    }
    if (body.companyName !== undefined) setting.companyName = text(body.companyName).slice(0, 80);
    if (body.companyId !== undefined) setting.companyId = text(body.companyId).slice(0, 64);
    if (body.phone !== undefined) {
      const phone = text(body.phone);
      if (phone && !isPhone(phone)) return errorResponse(res, "Phone must be 11 digits, like 01XXXXXXXXX", 400);
      setting.phone = phone;
    }
    if (body.pinCode !== undefined) {
      const pin = text(body.pinCode);
      if (pin && !isPin(pin)) return errorResponse(res, "PIN must be 4 to 8 digits", 400);
      setting.pinCode = pin;
    }

    if (body.events && typeof body.events === "object") {
      for (const event of NOTIFY_EVENTS) {
        const input = body.events[event.key];
        if (!input || typeof input !== "object") continue;
        const current = eventConfig(setting, event.key);
        const url = input.url !== undefined ? text(input.url) : current.url;
        if (url && !isUrl(url)) return errorResponse(res, `${event.label}: link must start with https://`, 400);
        setting.events.set(event.key, {
          enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
          priority: PRIORITIES.includes(input.priority) ? input.priority : current.priority,
          url,
        });
      }
    }

    if (typeof body.active === "boolean") {
      if (body.active && (!setting.apiKey || (!setting.companyId && !setting.phone))) {
        return errorResponse(res, "Set the API key and the app phone first", 400);
      }
      setting.active = body.active;
    }

    await setting.save();
    forgetNotifySetting();
    return successResponse(res, "Notification setting saved", view(setting));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

// Test — sends even while off, so it can be checked before switching on
router.post("/admin/test", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await AdminNotifySetting.current({ withKey: true });
    const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : "important";
    const result = await sendNotice(setting, {
      title: "পরীক্ষা — Notification App",
      message: `এই সাইট থেকে পরীক্ষার notification (${priority}) — ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}`,
      priority,
      actionUrl: actionUrlOf(setting, "deposit-request", "/"),
    });
    setting.lastSentAt = new Date();
    setting.sentCount += 1;
    setting.lastError = "";
    await setting.save();
    forgetNotifySetting();
    return successResponse(res, "Test notification sent", { result });
  } catch (error) {
    await AdminNotifySetting.updateOne({ key: "main" }, { $set: { lastError: `test: ${error.message}`.slice(0, 300), lastErrorAt: new Date() } }).catch(() => {});
    return errorResponse(res, error.message, 502);
  }
});

/**
 * Create this site's Company on the notification system — the APK signs in
 * with this phone + PIN. Without a PIN a random 6-digit one is made.
 */
router.post("/admin/company", protectAdmin, requireMother, async (req, res) => {
  try {
    const setting = await AdminNotifySetting.current({ withKey: true });
    if (!setting.apiKey) return errorResponse(res, "Save the API key first", 400);

    const name = text(req.body?.name).slice(0, 80);
    const phone = text(req.body?.phone);
    const pinCode = text(req.body?.pinCode) || String(crypto.randomInt(100000, 1000000));
    const websiteUrl = text(req.body?.websiteUrl);
    if (!name) return errorResponse(res, "Enter a name", 400);
    if (!isPhone(phone)) return errorResponse(res, "Phone must be 11 digits, like 01XXXXXXXXX", 400);
    if (!isPin(pinCode)) return errorResponse(res, "PIN must be 4 to 8 digits", 400);

    const response = await fetch(`${setting.apiBase.replace(/\/+$/, "")}/api/v1/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": setting.apiKey },
      body: JSON.stringify({ name, phone, pinCode, ...(websiteUrl ? { websiteUrl } : {}) }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) return errorResponse(res, body?.message || `Notification server answered ${response.status}`, 502);

    const company = body?.data || body?.company || body;
    setting.companyId = text(company?._id || company?.id);
    setting.companyName = name;
    setting.phone = phone;
    setting.pinCode = pinCode;
    await setting.save();
    forgetNotifySetting();
    return successResponse(res, "Notification account created", view(setting));
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
});

export default router;
