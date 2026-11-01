import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { api } from "../../api/axios";
import {
  FaTrophy,
  FaToggleOn,
  FaToggleOff,
  FaSave,
  FaSyncAlt,
  FaUpload,
  FaSearch,
  FaUndo,
  FaExclamationTriangle,
  FaUsers,
  FaArrowUp,
  FaArrowDown,
  FaLock,
} from "react-icons/fa";

const API_URL = import.meta.env.VITE_API_URL;

const getImg = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${API_URL}${url}`;
};

const money = (value) =>
  `৳ ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const cardClass =
  "rounded-3xl border border-blue-200/15 bg-black/30 backdrop-blur-xl shadow-[0_20px_80px_rgba(47,121,201,0.18)]";

const inputClass =
  "w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25 placeholder:text-blue-100/35";

const labelClass =
  "text-[12px] font-extrabold uppercase tracking-wide text-blue-100/70";

const STATUS_CHIP = {
  idle: "border-blue-200/15 bg-white/5 text-blue-100/70",
  playing: "border-blue-300/30 bg-blue-500/15 text-blue-200",
  exposure: "border-yellow-300/30 bg-yellow-500/15 text-yellow-200",
  settled: "border-emerald-300/30 bg-emerald-500/15 text-emerald-200",
};

const StatCard = ({ title, value, icon, colorClass }) => (
  <div className="rounded-[24px] border border-blue-200/15 bg-gradient-to-br from-black/80 via-[#2f79c9]/20 to-black/80 p-5 shadow-lg shadow-blue-900/20">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
          {title}
        </div>
        <div className={`mt-2 text-2xl font-black ${colorClass}`}>{value}</div>
      </div>
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200/15 bg-black/45 text-xl ${colorClass}`}
      >
        {icon}
      </div>
    </div>
  </div>
);

/*
 * 9 Wicket (transfer wallet, as in Raza7 / Bir75).
 *
 * While it is on, players see "9 Wicket" in the Sports row. Opening it sends
 * the player's whole-taka balance to 9 Wicket; what is left comes back to the
 * main balance on the next balance refresh. The list below shows each
 * player's money sent, returned and held in open bets.
 */
const NineWicket = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState(null);
  const [stats, setStats] = useState({});
  const [lastError, setLastError] = useState("");
  const [defaultUid, setDefaultUid] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [wallets, setWallets] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [filter, setFilter] = useState({ q: "", status: "" });
  const [listLoading, setListLoading] = useState(false);
  const [syncing, setSyncing] = useState("");

  const applySetting = useCallback((data) => {
    const s = data?.setting || {};

    setForm({
      active: !!s.active,
      autoReturn: s.autoReturn !== false,
      nameBn: s.name?.bn || "",
      nameEn: s.name?.en || "",
      image: s.image || "",
      position: String(s.position ?? 0),
      gameUId: s.gameUId || "",
    });
    setStats(data?.stats || {});
    setLastError(s.lastError || "");
    setDefaultUid(data?.defaultGameUId || "");
  }, []);

  const loadSetting = useCallback(
    () =>
      api
        .get("/api/nine-wicket/admin")
        .then(({ data }) => applySetting(data?.data))
        .catch((err) => toast.error(err?.response?.data?.message || "Load failed")),
    [applySetting],
  );

  const fetchWallets = useCallback(
    () =>
      api
        .get("/api/nine-wicket/wallets", {
          params: {
            page,
            limit: 20,
            ...(filter.q ? { q: filter.q } : {}),
            ...(filter.status === "hasExposure"
              ? { hasExposure: "true" }
              : filter.status
                ? { status: filter.status }
                : {}),
          },
        })
        .then(({ data }) => {
          setWallets(data?.data?.wallets || []);
          setMeta(data?.data?.meta || { page: 1, totalPages: 1, total: 0 });
        })
        .catch((err) => toast.error(err?.response?.data?.message || "Load failed"))
        .finally(() => setListLoading(false)),
    [page, filter],
  );

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const uploadImage = async (file) => {
    if (!file) return;

    try {
      setUploading(true);
      const body = new FormData();
      body.append("image", file);

      const { data } = await api.post("/api/nine-wicket/upload-image", body);
      set("image", data?.data?.image || "");
      toast.success("Image uploaded — save to keep it");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);

      const { data } = await api.put("/api/nine-wicket/admin", {
        active: form.active,
        autoReturn: form.autoReturn,
        name: { bn: form.nameBn.trim(), en: form.nameEn.trim() },
        image: form.image.trim(),
        position: Number(form.position) || 0,
        gameUId: form.gameUId.trim(),
      });

      toast.success(data?.message || "Saved");
      loadSetting();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const returnNow = async (wallet) => {
    const userId = wallet?.user?._id || wallet?.user;
    if (!userId) return;

    try {
      setSyncing(String(userId));
      const { data } = await api.post(`/api/nine-wicket/wallets/${userId}/sync`);
      toast.success(data?.message || "Done");
      setListLoading(true);
      fetchWallets();
      loadSetting();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed");
    } finally {
      setSyncing("");
    }
  };

  if (!form) {
    return (
      <div className="p-4 lg:p-6">
        <div className={`${cardClass} p-8 text-center text-blue-100`}>
          Loading 9 Wicket settings...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-gradient-to-r from-black/80 via-[#2f79c9]/40 to-black/80 text-white shadow-[0_20px_80px_rgba(47,121,201,0.22)] backdrop-blur-xl">
          <div className="px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/40">
                  <FaTrophy className="text-2xl text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    9 Wicket
                  </h1>
                  <p className="mt-1 text-sm font-medium text-blue-100/75">
                    Transfer wallet — the whole balance goes to 9 Wicket when it
                    opens and comes back on the next balance refresh.
                  </p>
                </div>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black ${
                  form.active
                    ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                    : "border-red-300/30 bg-red-400/15 text-red-200"
                }`}
              >
                {form.active ? <FaToggleOn /> : <FaToggleOff />}
                {form.active ? "SHOWN IN SPORTS" : "HIDDEN FROM PLAYERS"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Players" value={Number(stats.players || 0)} icon={<FaUsers />} colorClass="text-[#8fc2f5]" />
          <StatCard title="Sent to 9 Wicket" value={money(stats.transferred)} icon={<FaArrowUp />} colorClass="text-orange-300" />
          <StatCard title="Returned" value={money(stats.returned)} icon={<FaArrowDown />} colorClass="text-emerald-300" />
          <StatCard title="Held in open bets" value={money(stats.exposure)} icon={<FaLock />} colorClass="text-yellow-300" />
        </div>

        {lastError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
            <FaExclamationTriangle className="mt-0.5 shrink-0 text-red-300" />
            <div>
              <div className="font-extrabold">Last 9 Wicket error</div>
              <div className="mt-1 text-red-100/80">{lastError}</div>
            </div>
          </div>
        ) : null}

        <div className={`${cardClass} p-5 md:p-6`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-blue-200/10 bg-gradient-to-r from-[#63a8ee]/10 to-[#2f79c9]/10 p-4 font-bold text-white">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-5 w-5 cursor-pointer accent-[#2f79c9]"
              />
              <span>
                Show 9 Wicket to players
                <span className="block text-xs font-medium text-blue-100/60">
                  Adds it to the Sports row on the client site.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-blue-200/10 bg-white/5 p-4 font-bold text-white">
              <input
                type="checkbox"
                checked={form.autoReturn}
                onChange={(e) => set("autoReturn", e.target.checked)}
                className="h-5 w-5 cursor-pointer accent-[#2f79c9]"
              />
              <span>
                Bring money back on balance refresh
                <span className="block text-xs font-medium text-blue-100/60">
                  Off = money comes back only with "Return now" or the next game open.
                </span>
              </span>
            </label>

            <div>
              <label className={labelClass}>Name (Bangla)</label>
              <input value={form.nameBn} onChange={(e) => set("nameBn", e.target.value)} placeholder="৯ উইকেট" className={`${inputClass} mt-2`} />
            </div>
            <div>
              <label className={labelClass}>Name (English)</label>
              <input value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} placeholder="9 Wicket" className={`${inputClass} mt-2`} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Image</label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-20 items-center justify-center overflow-hidden rounded-2xl border border-blue-200/15 bg-white">
                  {form.image ? (
                    <img src={getImg(form.image)} alt="9 Wicket" className="h-full w-full object-contain" />
                  ) : (
                    <FaTrophy className="text-xl text-[#2f79c9]" />
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-blue-200/15 bg-white/5 px-4 py-3 text-sm font-bold text-blue-50 transition hover:bg-white/10">
                  <FaUpload />
                  {uploading ? "Uploading..." : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      uploadImage(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <input
                  value={form.image}
                  onChange={(e) => set("image", e.target.value)}
                  placeholder="/uploads/... or https://..."
                  className={`${inputClass} min-w-[220px] flex-1`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Position in Sports row</label>
              <input type="number" min="0" value={form.position} onChange={(e) => set("position", e.target.value)} className={`${inputClass} mt-2`} />
              <p className="mt-1 text-xs text-blue-100/50">0 = first card.</p>
            </div>
            <div>
              <label className={labelClass}>Game UID (from Oracle)</label>
              <input value={form.gameUId} onChange={(e) => set("gameUId", e.target.value)} placeholder={defaultUid} className={`${inputClass} mt-2 font-mono text-sm`} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={loadSetting}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-blue-200/15 bg-black/35 px-5 py-3 font-extrabold text-blue-50 transition hover:bg-white/10"
            >
              <FaSyncAlt />
              Refresh
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-6 py-3 font-extrabold text-white shadow-lg shadow-blue-700/30 transition hover:from-[#7bb7f1] hover:to-[#3b88db] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaSave />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-black/30 text-white shadow-[0_20px_80px_rgba(47,121,201,0.18)] backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-4 border-b border-blue-200/10 p-5 md:grid-cols-[1fr_220px] md:p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setListLoading(true);
                setFilter((prev) => ({ ...prev, q: qInput.trim() }));
              }}
              className="relative"
            >
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8fc2f5]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search by userId / phone / 9 Wicket name"
                className="w-full rounded-2xl border border-blue-200/15 bg-black/40 py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-blue-100/35 focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25"
              />
            </form>

            <select
              value={filter.status}
              onChange={(e) => {
                setPage(1);
                setListLoading(true);
                setFilter((prev) => ({ ...prev, status: e.target.value }));
              }}
              className="w-full cursor-pointer rounded-2xl border border-blue-200/15 bg-black/40 px-3 py-3 text-white outline-none"
            >
              <option value="">All wallets</option>
              <option value="hasExposure">Has open bets</option>
              <option value="playing">Playing</option>
              <option value="exposure">Exposure</option>
              <option value="settled">Settled</option>
              <option value="idle">Idle</option>
            </select>
          </div>

          {listLoading && !wallets.length ? (
            <div className="p-12 text-center text-blue-100/55">Loading...</div>
          ) : wallets.length === 0 ? (
            <div className="p-12 text-center text-blue-100/55">No 9 Wicket wallets yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead>
                  <tr className="bg-black/35 text-sm text-blue-100/85">
                    {["Player", "9W name", "Status", "Sent", "Returned", "Exposure", "Site balance", "Last sync", ""].map((h) => (
                      <th key={h} className="px-5 py-4 font-extrabold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w._id} className="border-b border-blue-200/8 hover:bg-white/[0.03]">
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => w.user?._id && navigate(`/single-user-details/${w.user._id}`)}
                          className="cursor-pointer font-extrabold text-white/90 underline decoration-blue-300/40 underline-offset-4 transition hover:text-[#8fc2f5]"
                        >
                          {w.user?.userId || "—"}
                        </button>
                        <div className="text-xs text-blue-100/55">{w.user?.phone || ""}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-blue-100/80">{w.username}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${STATUS_CHIP[w.status] || STATUS_CHIP.idle}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-bold text-orange-300">{money(w.totalTransferred)}</td>
                      <td className="px-5 py-4 font-bold text-emerald-300">{money(w.totalReturned)}</td>
                      <td className="px-5 py-4 font-bold text-yellow-300">{money(w.exposureBalance)}</td>
                      <td className="px-5 py-4 text-white/90">{money(w.user?.balance)}</td>
                      <td className="px-5 py-4 text-xs text-blue-100/60">{when(w.lastSyncAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          disabled={syncing === String(w.user?._id)}
                          onClick={() => returnNow(w)}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-200/15 bg-white/5 px-3 py-2 text-[12px] font-extrabold text-blue-100 transition hover:bg-white/10 disabled:opacity-50"
                        >
                          <FaUndo className={syncing === String(w.user?._id) ? "animate-spin" : ""} />
                          Return now
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-blue-200/10 px-6 py-5">
              <button
                type="button"
                onClick={() => {
                  setListLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page <= 1}
                className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <div className="rounded-xl border border-blue-200/15 bg-black/35 px-4 py-2 text-blue-100">
                Page <span className="font-black text-white">{page}</span> / {meta.totalPages}
              </div>
              <button
                type="button"
                onClick={() => {
                  setListLoading(true);
                  setPage((p) => Math.min(meta.totalPages, p + 1));
                }}
                disabled={page >= meta.totalPages}
                className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NineWicket;
