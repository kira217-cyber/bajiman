import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { api } from "../../api/axios";
import {
  FaFillDrip,
  FaSearch,
  FaSyncAlt,
  FaUser,
  FaPhoneAlt,
  FaCheckSquare,
  FaRegSquare,
  FaHistory,
} from "react-icons/fa";

const money = (value) =>
  `৳ ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const SOURCE_LABEL = {
  deposit: "Deposit",
  "auto-deposit": "Auto Deposit",
  "auto-personal-deposit": "Personal Auto Deposit",
  "register-bonus": "Register Bonus",
  "admin-manual-deposit": "Manual Deposit (admin)",
  redeem: "Refer Redeem",
};

const cardClass =
  "rounded-3xl border border-blue-200/15 bg-black/30 backdrop-blur-xl shadow-[0_20px_80px_rgba(47,121,201,0.18)]";

const inputClass =
  "w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25 placeholder:text-blue-100/35";

/*
 * Turnover Fill-up — find a player, fill their running turnover by hand
 * (selected ones or all), so the withdrawal lock opens. Every fill is kept
 * in the history below with the admin, the note and how much was waived.
 */
const TurnoverFill = () => {
  const navigate = useNavigate();

  const [qInput, setQInput] = useState("");
  const [players, setPlayers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState({}); // userId -> Set of turnover ids
  const [notes, setNotes] = useState({});
  const [confirm, setConfirm] = useState(null); // { user, ids }
  const [filling, setFilling] = useState(false);

  const [fills, setFills] = useState([]);
  const [summary, setSummary] = useState({ totalFilled: 0, turnovers: 0 });
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [historyQ, setHistoryQ] = useState("");
  const [historyInput, setHistoryInput] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(
    () =>
      api
        .get("/api/turnovers/admin/fills", {
          params: { page, limit: 20, ...(historyQ ? { q: historyQ } : {}) },
        })
        .then(({ data }) => {
          setFills(data?.data?.fills || []);
          setSummary(data?.data?.summary || { totalFilled: 0, turnovers: 0 });
          setMeta(data?.data?.meta || { page: 1, totalPages: 1, total: 0 });
        })
        .catch((err) => toast.error(err?.response?.data?.message || "Failed to load history"))
        .finally(() => setHistoryLoading(false)),
    [page, historyQ],
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const search = async (e) => {
    e?.preventDefault();
    const q = qInput.trim();

    if (q.length < 2) {
      toast.info("Type at least 2 characters");
      return;
    }

    try {
      setSearching(true);
      const { data } = await api.get("/api/turnovers/admin/fill/find", { params: { q } });
      const list = data?.data?.users || [];
      setPlayers(list);
      setSelected({});
      if (!list.length) toast.info("No player found");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const toggle = (userId, turnoverId) =>
    setSelected((prev) => {
      const next = new Set(prev[userId] || []);
      if (next.has(turnoverId)) next.delete(turnoverId);
      else next.add(turnoverId);
      return { ...prev, [userId]: next };
    });

  const doFill = async () => {
    if (!confirm) return;

    try {
      setFilling(true);
      const { data } = await api.post("/api/turnovers/admin/fill", {
        userId: confirm.user._id,
        turnoverIds: confirm.ids,
        note: notes[confirm.user._id] || "",
      });

      toast.success(data?.message || "Filled");
      setConfirm(null);
      setNotes((prev) => ({ ...prev, [confirm.user._id]: "" }));
      await search();
      setHistoryLoading(true);
      setPage(1);
      fetchHistory();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Fill failed");
    } finally {
      setFilling(false);
    }
  };

  const confirmTotal = confirm
    ? (confirm.user.turnovers || [])
        .filter((row) => !confirm.ids.length || confirm.ids.includes(row._id))
        .reduce((sum, row) => sum + Number(row.remaining || 0), 0)
    : 0;

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-gradient-to-r from-black/80 via-[#2f79c9]/40 to-black/80 text-white shadow-[0_20px_80px_rgba(47,121,201,0.22)] backdrop-blur-xl">
          <div className="flex items-center gap-4 px-5 py-5 md:px-6 md:py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/40">
              <FaFillDrip className="text-2xl text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                Turnover Fill-up
              </h1>
              <p className="mt-1 text-sm font-medium text-blue-100/75">
                Fill a player&apos;s running turnover by hand — the withdrawal
                lock opens. Every fill is kept in the history below.
              </p>
            </div>
          </div>
        </div>

        <div className={`${cardClass} p-5 md:p-6`}>
          <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8fc2f5]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Player userId or phone"
                className={`${inputClass} pl-11`}
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-6 py-3 font-extrabold text-white shadow-lg shadow-blue-700/30 transition hover:from-[#7bb7f1] hover:to-[#3b88db] disabled:opacity-60"
            >
              <FaSearch />
              {searching ? "Searching..." : "Find Player"}
            </button>
          </form>

          <div className="mt-5 space-y-4">
            {players.map((user) => {
              const picked = selected[user._id] || new Set();
              const rows = user.turnovers || [];

              return (
                <div
                  key={user._id}
                  className="rounded-3xl border border-blue-200/12 bg-gradient-to-br from-black/35 via-[#2f79c9]/10 to-black/35 p-4 md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/single-user-details/${user._id}`)}
                        className="inline-flex cursor-pointer items-center gap-2 font-black text-white underline decoration-blue-300/40 underline-offset-4 hover:text-[#8fc2f5]"
                      >
                        <FaUser className="text-[#8fc2f5]" />
                        {user.userId}
                      </button>
                      <span className="inline-flex items-center gap-2 text-sm text-blue-100/65">
                        <FaPhoneAlt className="text-[#8fc2f5]" />
                        {user.phone || "—"}
                      </span>
                      <span className="text-sm text-blue-100/65">
                        Balance <b className="text-white">{money(user.balance)}</b>
                      </span>
                    </div>
                    <span className="rounded-full border border-blue-200/15 bg-white/5 px-3 py-1 text-xs font-black text-blue-100">
                      {rows.length} running
                    </span>
                  </div>

                  {rows.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-blue-200/15 p-6 text-center text-sm text-blue-100/55">
                      No running turnover — nothing to fill
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 space-y-2">
                        {rows.map((row) => {
                          const on = picked.has(row._id);

                          return (
                            <button
                              key={row._id}
                              type="button"
                              onClick={() => toggle(user._id, row._id)}
                              className={`flex w-full cursor-pointer items-center gap-4 rounded-2xl border p-3 text-left transition ${
                                on
                                  ? "border-[#63a8ee]/60 bg-[#2f79c9]/20"
                                  : "border-blue-200/10 bg-white/5 hover:bg-white/10"
                              }`}
                            >
                              <span className="text-lg text-[#8fc2f5]">
                                {on ? <FaCheckSquare /> : <FaRegSquare />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <span className="font-bold text-white">
                                    {SOURCE_LABEL[row.sourceType] || row.sourceType}
                                  </span>
                                  <span className="text-blue-100/70">
                                    {money(row.progress)} / {money(row.required)} ·{" "}
                                    <b className="text-orange-300">left {money(row.remaining)}</b>
                                  </span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#63a8ee] to-[#2f79c9]"
                                    style={{ width: `${row.percent}%` }}
                                  />
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex flex-col gap-3 md:flex-row">
                        <input
                          value={notes[user._id] || ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [user._id]: e.target.value }))}
                          placeholder="Note (optional) — why it is filled"
                          className={`${inputClass} flex-1`}
                        />
                        <button
                          type="button"
                          disabled={!picked.size}
                          onClick={() => setConfirm({ user, ids: [...picked] })}
                          className="cursor-pointer rounded-2xl border border-blue-200/15 bg-white/5 px-5 py-3 font-extrabold text-blue-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Fill selected ({picked.size})
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ user, ids: [] })}
                          className="cursor-pointer rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-700/30 transition hover:from-[#7bb7f1] hover:to-[#3b88db]"
                        >
                          Fill all ({rows.length})
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-black/30 text-white shadow-[0_20px_80px_rgba(47,121,201,0.18)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-blue-200/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black">
                <FaHistory className="text-[#8fc2f5]" />
                Fill History
              </h2>
              <p className="mt-1 text-sm text-blue-100/65">
                {meta.total} fills · {summary.turnovers} turnovers · waived{" "}
                <b className="text-orange-300">{money(summary.totalFilled)}</b>
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setHistoryLoading(true);
                setHistoryQ(historyInput.trim());
              }}
              className="flex gap-2"
            >
              <input
                value={historyInput}
                onChange={(e) => setHistoryInput(e.target.value)}
                placeholder="Filter by userId"
                className={`${inputClass} md:w-64`}
              />
              <button
                type="button"
                onClick={() => {
                  setHistoryLoading(true);
                  fetchHistory();
                }}
                className="cursor-pointer rounded-2xl border border-blue-200/15 bg-white/5 px-4 text-blue-100 transition hover:bg-white/10"
                title="Refresh"
              >
                <FaSyncAlt className={historyLoading ? "animate-spin" : ""} />
              </button>
            </form>
          </div>

          {fills.length === 0 ? (
            <div className="p-12 text-center text-blue-100/55">
              {historyLoading ? "Loading..." : "No fill yet"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="bg-black/35 text-sm text-blue-100/85">
                    {["Player", "Turnovers", "Waived", "Admin", "Note", "Date"].map((h) => (
                      <th key={h} className="px-5 py-4 font-extrabold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fills.map((fill) => (
                    <tr key={fill._id} className="border-b border-blue-200/8 align-top hover:bg-white/[0.03]">
                      <td className="px-5 py-4 font-extrabold text-white/90">
                        {fill.user?.userId || fill.userIdText}
                        <div className="text-xs font-normal text-blue-100/55">{fill.user?.phone || ""}</div>
                      </td>
                      <td className="px-5 py-4 text-xs text-blue-100/75">
                        {(fill.items || []).map((item) => (
                          <div key={item.turnover}>
                            {SOURCE_LABEL[item.sourceType] || item.sourceType}: {money(item.progressBefore)} →{" "}
                            {money(item.required)}
                          </div>
                        ))}
                      </td>
                      <td className="px-5 py-4 font-black text-orange-300">{money(fill.totalFilled)}</td>
                      <td className="px-5 py-4 text-sm text-blue-100/75">{fill.adminEmail || "—"}</td>
                      <td className="max-w-[240px] px-5 py-4 text-sm text-blue-100/75">{fill.note || "—"}</td>
                      <td className="px-5 py-4 text-xs text-blue-100/60">{new Date(fill.createdAt).toLocaleString()}</td>
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
                disabled={page <= 1}
                onClick={() => {
                  setHistoryLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
                className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <div className="rounded-xl border border-blue-200/15 bg-black/35 px-4 py-2 text-blue-100">
                Page <span className="font-black text-white">{page}</span> / {meta.totalPages}
              </div>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => {
                  setHistoryLoading(true);
                  setPage((p) => Math.min(meta.totalPages, p + 1));
                }}
                className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => !filling && setConfirm(null)} />
          <div className="relative w-full max-w-md rounded-[28px] border border-blue-200/20 bg-gradient-to-br from-black via-[#2f79c9]/20 to-black p-6 text-white shadow-2xl">
            <div className="text-2xl font-black">Fill turnover?</div>
            <div className="mt-2 text-sm text-blue-100/70">
              {confirm.ids.length || (confirm.user.turnovers || []).length} running turnover of{" "}
              <b className="text-white">{confirm.user.userId}</b> will be marked completed —{" "}
              <b className="text-orange-300">{money(confirmTotal)}</b> waived without play. The
              player can withdraw after this.
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={filling}
                onClick={() => setConfirm(null)}
                className="cursor-pointer rounded-2xl border border-blue-200/15 bg-white/5 px-4 py-3 font-bold transition hover:bg-white/10 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={filling}
                onClick={doFill}
                className="cursor-pointer rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-4 py-3 font-extrabold text-white transition disabled:opacity-60"
              >
                {filling ? "Filling..." : "Confirm Fill"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TurnoverFill;
