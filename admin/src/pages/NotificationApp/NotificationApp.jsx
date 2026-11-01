import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { api } from "../../api/axios";
import {
  FaBell,
  FaDownload,
  FaEye,
  FaEyeSlash,
  FaLink,
  FaMobileAlt,
  FaPaperPlane,
  FaPowerOff,
  FaSave,
  FaSyncAlt,
  FaExclamationTriangle,
  FaUserPlus,
} from "react-icons/fa";

// The APK is a file of the admin site itself (public/notification.apk)
export const NOTIFICATION_APK = `${import.meta.env.BASE_URL}notification.apk`;

const SOUNDS = [
  { key: "important", icon: "🚨", label: "Loud", hint: "Ring + alarm" },
  { key: "normal", icon: "🔔", label: "Normal", hint: "Standard chime" },
  { key: "silent", icon: "🔕", label: "Silent", hint: "No sound" },
];

const cardClass =
  "rounded-3xl border border-blue-200/15 bg-black/30 backdrop-blur-xl shadow-[0_20px_80px_rgba(47,121,201,0.18)]";

const inputClass =
  "w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25 placeholder:text-blue-100/35";

const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#2f79c9]/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:border-[#63a8ee]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "mb-2 block text-sm font-semibold text-blue-100/80";

const fmtTime = (value) => (value ? new Date(value).toLocaleString("en-GB") : "—");

const Spinner = () => (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
);

/*
 * Notification App — push alerts to the owner's phone.
 *
 * The owner installs the APK and signs in with the phone + PIN below. Which
 * events send a notification, with which sound, and which admin page opens
 * when it is tapped — all set here. Mother admin only.
 */
const NotificationApp = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showPin, setShowPin] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [events, setEvents] = useState([]);

  const fill = (next) => {
    setData(next);
    const s = next?.setting || {};
    setApiBase(s.apiBase || "");
    setAdminUrl(s.adminUrl || "");
    setPhone(s.phone || "");
    setPinCode(s.pinCode || "");
    setCompanyName(s.companyName || "");
    setEvents((next?.events || []).map((e) => ({ ...e })));
  };

  const load = async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get("/api/admin-notify/admin");
      fill(res?.data || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (action, request, after) => {
    try {
      setBusy(action);
      const { data: res } = await request();
      if (res?.data?.setting) fill(res.data);
      toast.success(res?.message || "Done");
      after?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed");
    } finally {
      setBusy("");
    }
  };

  const setting = data?.setting || {};
  const active = Boolean(setting.active);
  const ready = Boolean(setting.hasKey) && Boolean(setting.companyId || setting.phone);

  const setEvent = (key, patch) =>
    setEvents((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const setAll = (enabled) => setEvents((prev) => prev.map((e) => ({ ...e, enabled })));

  const groups = useMemo(() => {
    const map = new Map();
    events.forEach((e) => map.set(e.group, [...(map.get(e.group) || []), e]));
    return [...map.entries()];
  }, [events]);

  const saveAll = (e) => {
    e?.preventDefault();
    run(
      "save",
      () =>
        api.put("/api/admin-notify/admin", {
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          apiBase,
          adminUrl,
          phone,
          pinCode,
          companyName,
          events: Object.fromEntries(
            events.map((ev) => [ev.key, { enabled: ev.enabled, priority: ev.priority, url: ev.url }]),
          ),
        }),
      () => setApiKey(""),
    );
  };

  // Creates the account the APK signs in with (uses the saved API key)
  const createCompany = () =>
    run("company", () =>
      api.post("/api/admin-notify/admin/company", {
        name: companyName,
        phone,
        pinCode,
        websiteUrl: window.location.origin,
      }),
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-white">
      {/* Header */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-black/80 via-[#2f79c9]/40 to-black/80 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] text-xl shadow-lg shadow-[#2f79c9]/30">
              <FaBell />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold">Notification App</h1>
              <p className="text-sm text-blue-100/70">
                Push alerts to the owner's phone — deposits, withdraws, sign-ups and more.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={NOTIFICATION_APK} download="notification.apk" className={primaryBtn}>
              <FaDownload />
              Download App (APK)
            </a>
            <button type="button" onClick={load} disabled={loading} className={ghostBtn}>
              <FaSyncAlt className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                active
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-blue-200/15 bg-black/40 text-blue-100/50"
              }`}
            >
              <FaPowerOff />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">
                {loading ? "Loading…" : active ? "Notifications are on" : "Notifications are off"}
              </h2>
              <p className="mt-1 text-sm text-blue-100/60">
                {setting.hasKey ? `API key ${setting.keyPreview}` : "No API key yet."} · Sent{" "}
                {setting.sentCount || 0} · Last {fmtTime(setting.lastSentAt)}
              </p>
              {setting.lastError && (
                <p className="mt-2 flex items-center gap-2 text-sm text-red-300">
                  <FaExclamationTriangle />
                  Last error ({fmtTime(setting.lastErrorAt)}): {setting.lastError}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-blue-200/10 pt-5">
            <button
              type="button"
              disabled={Boolean(busy) || (!active && !ready)}
              onClick={() => run("toggle", () => api.put("/api/admin-notify/admin", { active: !active }))}
              className={active ? ghostBtn : primaryBtn}
            >
              {busy === "toggle" ? <Spinner /> : <FaPowerOff />}
              {active ? "Turn notifications off" : "Turn notifications on"}
            </button>
            {SOUNDS.map((sound) => (
              <button
                key={sound.key}
                type="button"
                disabled={Boolean(busy) || !ready}
                onClick={() =>
                  run(`test-${sound.key}`, () =>
                    api.post("/api/admin-notify/admin/test", { priority: sound.key }),
                  )
                }
                className={ghostBtn}
              >
                {busy === `test-${sound.key}` ? <Spinner /> : <FaPaperPlane />}
                Test {sound.label.toLowerCase()}
              </button>
            ))}
          </div>
          {!ready && !loading && (
            <p className="mt-3 text-xs text-amber-200/80">
              Save the API key and create the app account (below) before turning it on.
            </p>
          )}
        </div>
      </div>

      {/* App login */}
      <div className={`${cardClass} p-6`}>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FaMobileAlt className="text-[#63a8ee]" />
          Login in the app
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-blue-100/75">
          <li>Download the APK (button above) and install it on the owner's Android phone.</li>
          <li>Open it and log in with the phone number and PIN below. Allow notifications.</li>
          <li>Press "Test loud" — the phone should ring.</li>
        </ol>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-200/10 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-100/45">Account</p>
            <p className="mt-1 font-bold">{setting.companyName || "—"}</p>
          </div>
          <div className="rounded-2xl border border-blue-200/10 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-100/45">Phone</p>
            <p className="mt-1 font-mono font-bold">{setting.phone || "—"}</p>
          </div>
          <div className="rounded-2xl border border-blue-200/10 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-100/45">PIN</p>
            <p className="mt-1 flex items-center gap-2 font-mono font-bold">
              {setting.pinCode ? (showPin ? setting.pinCode : "••••••") : "—"}
              {setting.pinCode && (
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="text-blue-100/50 hover:text-white"
                  aria-label="Show PIN"
                >
                  {showPin ? <FaEyeSlash /> : <FaEye />}
                </button>
              )}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={saveAll} className="space-y-6">
        {/* Events */}
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">What sends a notification</h2>
              <p className="mt-1 text-sm text-blue-100/60">
                Turn each one on or off, pick its sound, and the page it opens when tapped.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAll(true)} className={ghostBtn}>
                All on
              </button>
              <button type="button" onClick={() => setAll(false)} className={ghostBtn}>
                All off
              </button>
            </div>
          </div>

          {groups.map(([group, list]) => (
            <div key={group} className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#63a8ee]">{group}</p>
              <div className="flex flex-col gap-2">
                {list.map((ev) => (
                  <div
                    key={ev.key}
                    className={`rounded-2xl border border-blue-200/10 bg-black/30 p-4 ${ev.enabled ? "" : "opacity-60"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={ev.enabled}
                          onChange={(e) => setEvent(ev.key, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-[#63a8ee]"
                        />
                        <span>
                          <span className="block text-sm font-bold">{ev.label}</span>
                          <span className="block text-xs text-blue-100/55">{ev.title}</span>
                        </span>
                      </label>
                      <div className="flex gap-1.5">
                        {SOUNDS.map((sound) => (
                          <button
                            key={sound.key}
                            type="button"
                            title={sound.hint}
                            onClick={() => setEvent(ev.key, { priority: sound.key })}
                            className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                              ev.priority === sound.key
                                ? "border-[#63a8ee] bg-[#2f79c9]/25 text-white"
                                : "border-blue-200/10 text-blue-100/55 hover:border-blue-200/30"
                            }`}
                          >
                            {sound.icon} {sound.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <FaLink className="shrink-0 text-blue-100/35" />
                      <input
                        value={ev.url}
                        onChange={(e) => setEvent(ev.key, { url: e.target.value })}
                        placeholder={ev.link || "Set the admin URL below"}
                        className={`${inputClass} !py-2 font-mono text-xs`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Connection */}
        <div className={`${cardClass} p-6`}>
          <h2 className="text-lg font-bold">Connection</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="nt-admin">
                Admin URL (opened when a notification is tapped)
              </label>
              <input
                id="nt-admin"
                value={adminUrl}
                onChange={(e) => setAdminUrl(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder={data?.defaultAdminUrl || "https://admin.example.com"}
              />
              <p className="mt-1 text-xs text-blue-100/45">
                Each notification opens its page here, e.g.{" "}
                {(adminUrl || data?.defaultAdminUrl || "https://admin…").replace(/\/+$/, "")}
                /deposit-requests. A link typed on a row above wins.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor="nt-name">
                Account name
              </label>
              <input
                id="nt-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
                placeholder="Bajiman"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="nt-phone">
                App login phone
              </label>
              <input
                id="nt-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="01XXXXXXXXX"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="nt-pin">
                App login PIN
              </label>
              <input
                id="nt-pin"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="4–8 digits (blank = random on create)"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="nt-base">
                Notification API URL
              </label>
              <input
                id="nt-base"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="nt-key">
                API key (x-api-key)
              </label>
              <input
                id="nt-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder={
                  setting.hasKey ? `Saved ✓ ${setting.keyPreview} — leave blank to keep it` : "x-api-key"
                }
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-blue-200/10 pt-5">
            <button
              type="button"
              onClick={createCompany}
              disabled={Boolean(busy) || !setting.hasKey}
              className={ghostBtn}
            >
              {busy === "company" ? <Spinner /> : <FaUserPlus />}
              {setting.companyId ? "Create app account again" : "Create app account"}
            </button>
            <p className="text-xs text-blue-100/45">
              Makes the phone + PIN login on the notification server. Save the API key first.
            </p>
          </div>
        </div>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" disabled={Boolean(busy)} className={`${primaryBtn} px-6 py-3 shadow-xl`}>
            {busy === "save" ? <Spinner /> : <FaSave />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default NotificationApp;
