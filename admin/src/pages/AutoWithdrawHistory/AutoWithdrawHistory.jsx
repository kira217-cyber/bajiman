import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { api } from "../../api/axios";
import {
  FaSearch,
  FaSyncAlt,
  FaChevronDown,
  FaChevronUp,
  FaFilter,
  FaWallet,
  FaUser,
  FaPhoneAlt,
  FaCircle,
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaSpinner,
  FaBan,
  FaImage,
} from "react-icons/fa";

const inputClass =
  "w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25 placeholder:text-blue-100/35";

const money = (n) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return "৳ 0.00";

  return `৳ ${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const emptySummary = {
  pendingAmount: 0,
  pendingCount: 0,
  processingAmount: 0,
  processingCount: 0,
  completedAmount: 0,
  completedCount: 0,
  rejectedAmount: 0,
  rejectedCount: 0,
};

const statusChip = (status) => {
  const s = String(status || "PENDING").toUpperCase();

  if (s === "COMPLETED")
    return "bg-emerald-500/15 text-emerald-200 border-emerald-300/25";
  if (s === "REJECTED")
    return "bg-red-500/15 text-red-200 border-red-300/25";
  if (s === "PROCESSING")
    return "bg-blue-500/15 text-blue-200 border-blue-300/25";

  return "bg-yellow-500/15 text-yellow-200 border-yellow-300/25";
};

const statusDot = (status) => {
  const s = String(status || "PENDING").toUpperCase();
  if (s === "COMPLETED") return "text-emerald-300";
  if (s === "REJECTED") return "text-red-300";
  if (s === "PROCESSING") return "text-blue-300";
  return "text-yellow-300";
};

const FieldRow = ({ k, v }) => (
  <div className="flex items-start justify-between gap-4 border-b border-blue-200/10 py-2.5">
    <div className="text-[12px] font-extrabold uppercase tracking-wide text-blue-100/60">
      {k}
    </div>
    <div className="break-all text-right text-[13px] font-bold text-white/90">
      {v}
    </div>
  </div>
);

const SummaryCard = ({ title, amount, count, icon, colorClass }) => (
  <div className="rounded-[24px] border border-blue-200/15 bg-gradient-to-br from-black/80 via-[#2f79c9]/20 to-black/80 p-5 shadow-lg shadow-blue-900/20">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
          {title}
        </div>
        <div className={`mt-2 text-2xl font-black ${colorClass}`}>
          {money(amount)}
        </div>
        <div className="mt-2 text-sm font-semibold text-blue-100/65">
          {Number(count || 0)} records
        </div>
      </div>
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200/15 bg-black/45 text-xl ${colorClass}`}
      >
        {icon}
      </div>
    </div>
  </div>
);

const AutoWithdrawHistory = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(emptySummary);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  const page = pagination.page;
  const limit = pagination.limit;
  const totalPages = pagination.totalPages;

  const goUserDetails = (item) => {
    const userMongoId = String(item?.userMongoId || "");

    if (!userMongoId) {
      toast.error("User id not found");
      return;
    }

    navigate(`/single-user-details/${userMongoId}`);
  };

  const fetchData = async ({
    page: p = page,
    limit: l = limit,
    qv = q,
    sv = status,
  } = {}) => {
    try {
      if (!refreshing) setLoading(true);

      const params = { page: p, limit: l };
      if (qv) params.q = qv;
      if (sv !== "ALL") params.status = sv;

      const { data } = await api.get("/api/auto-withdraw/withdrawals/admin", {
        params,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Fetch failed");
      }

      setRows(Array.isArray(data?.data) ? data.data : []);
      setSummary({ ...emptySummary, ...(data?.summary || {}) });

      setPagination({
        page: Number(data?.pagination?.page || p),
        limit: Number(data?.pagination?.limit || l),
        total: Number(data?.pagination?.total || 0),
        totalPages: Number(data?.pagination?.totalPages || 1),
      });
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Server error",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData({ page: 1, qv: "", sv: "ALL" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const query = qInput.trim();
    setQ(query);
    setExpandedId("");
    fetchData({ page: 1, qv: query, sv: status });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setExpandedId("");
    await fetchData({ page, qv: q, sv: status });
    toast.info("Refreshed");
  };

  const onChangeStatus = (val) => {
    setStatus(val);
    setExpandedId("");
    fetchData({ page: 1, qv: q, sv: val });
  };

  const onChangeLimit = (val) => {
    setExpandedId("");
    fetchData({ page: 1, limit: Number(val || 20), qv: q, sv: status });
  };

  const onPageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setExpandedId("");
    fetchData({ page: newPage, qv: q, sv: status });
  };

  const confirmReject = async () => {
    try {
      setRejecting(true);

      const { data } = await api.post(
        `/api/auto-withdraw/withdrawals/${rejectId}/reject`,
        { reason: rejectReason.trim() || undefined },
      );

      if (!data?.success) {
        throw new Error(data?.message || "Reject failed");
      }

      toast.success(data?.message || "Rejected and refunded");
      setRejectId("");
      setRejectReason("");
      await fetchData({ page, qv: q, sv: status });
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Reject failed",
      );
    } finally {
      setRejecting(false);
    }
  };

  const headerStats = useMemo(
    () => ({
      total: Number(pagination.total || 0),
      showing: Array.isArray(rows) ? rows.length : 0,
    }),
    [pagination.total, rows],
  );

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-gradient-to-r from-black/80 via-[#2f79c9]/40 to-black/80 text-white shadow-[0_20px_80px_rgba(47,121,201,0.22)] backdrop-blur-xl">
          <div className="px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/40">
                  <FaWallet className="text-2xl text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    Auto Withdraw History
                  </h1>
                  <p className="mt-1 text-sm font-medium text-blue-100/75">
                    bKash/Nagad/Rocket/Upay auto withdraw records and gateway
                    status.
                  </p>
                </div>
              </div>

              <button
                onClick={onRefresh}
                disabled={loading || refreshing}
                className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-700/30 transition hover:from-[#7bb7f1] hover:to-[#3b88db] disabled:opacity-60"
              >
                <FaSyncAlt className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SummaryCard
            title="Pending"
            amount={summary.pendingAmount}
            count={summary.pendingCount}
            icon={<FaClock />}
            colorClass="text-yellow-300"
          />
          <SummaryCard
            title="Processing"
            amount={summary.processingAmount}
            count={summary.processingCount}
            icon={<FaSpinner />}
            colorClass="text-blue-300"
          />
          <SummaryCard
            title="Completed"
            amount={summary.completedAmount}
            count={summary.completedCount}
            icon={<FaCheckCircle />}
            colorClass="text-emerald-300"
          />
          <SummaryCard
            title="Rejected"
            amount={summary.rejectedAmount}
            count={summary.rejectedCount}
            icon={<FaTimesCircle />}
            colorClass="text-red-300"
          />
        </div>

        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-black/30 text-white shadow-[0_20px_80px_rgba(47,121,201,0.18)] backdrop-blur-xl">
          <div className="grid grid-cols-1 gap-4 border-b border-blue-200/10 p-5 md:grid-cols-[1fr_220px_220px] md:p-6">
            <form onSubmit={onSearch} className="relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8fc2f5]" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search by userId / phone / account number / withdrawal id"
                className="w-full rounded-2xl border border-blue-200/15 bg-black/40 py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-blue-100/35 focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25"
              />
            </form>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-blue-100/65">
                <FaFilter className="text-[#8fc2f5]" />
                Status
              </div>
              <select
                value={status}
                onChange={(e) => onChangeStatus(e.target.value)}
                className="w-full cursor-pointer rounded-2xl border border-blue-200/15 bg-black/40 px-3 py-3 text-white outline-none"
              >
                <option value="ALL">All</option>
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-[12px] font-extrabold uppercase tracking-wide text-blue-100/65">
                Per Page
              </div>
              <select
                value={limit}
                onChange={(e) => onChangeLimit(e.target.value)}
                className="w-full cursor-pointer rounded-2xl border border-blue-200/15 bg-black/40 px-3 py-3 text-white outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-b border-blue-200/10 px-5 py-4 md:grid-cols-3 md:px-6">
            <div className="rounded-2xl border border-blue-200/10 bg-white/5 p-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
                Total Records
              </div>
              <div className="mt-2 text-2xl font-black text-white">
                {headerStats.total}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-200/10 bg-white/5 p-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
                Showing This Page
              </div>
              <div className="mt-2 text-2xl font-black text-white">
                {headerStats.showing}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-200/10 bg-white/5 p-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
                Current Page
              </div>
              <div className="mt-2 text-2xl font-black text-white">
                {page} / {totalPages}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-blue-100/55">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-blue-100/55">
              No records found
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left">
                  <thead>
                    <tr className="bg-black/35 text-sm text-blue-100/85">
                      <th className="px-6 py-4 font-extrabold">User</th>
                      <th className="px-6 py-4 font-extrabold">Method</th>
                      <th className="px-6 py-4 font-extrabold">Amount</th>
                      <th className="px-6 py-4 font-extrabold">Deducted</th>
                      <th className="px-6 py-4 font-extrabold">Withdrawal ID</th>
                      <th className="px-6 py-4 font-extrabold">Status</th>
                      <th className="px-6 py-4 text-right font-extrabold">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((item) => {
                      const isExpanded = expandedId === item._id;
                      const s = String(item.status || "PENDING").toUpperCase();
                      const canReject = s === "PENDING" || s === "PROCESSING";

                      return (
                        <React.Fragment key={item._id}>
                          <tr className="border-b border-blue-200/8 hover:bg-white/[0.03]">
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="inline-flex items-center gap-2">
                                  <FaUser className="text-[#8fc2f5]" />
                                  <button
                                    type="button"
                                    onClick={() => goUserDetails(item)}
                                    className="cursor-pointer font-extrabold text-white/90 underline decoration-blue-300/40 underline-offset-4 transition hover:text-[#8fc2f5]"
                                  >
                                    {item.userDbUserId || "Unknown"}
                                  </button>
                                </div>
                                <div className="inline-flex items-center gap-2 text-[12px] text-blue-100/65">
                                  <FaPhoneAlt className="text-[#8fc2f5]" />
                                  <span>{item.userPhone || "—"}</span>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="text-sm font-bold uppercase text-white/85">
                                {item.paymentMethod}
                              </div>
                              <div className="mt-1 text-xs text-blue-100/60">
                                {item.accountNumber}
                              </div>
                            </td>

                            <td className="px-6 py-4 font-extrabold text-[#8fc2f5]">
                              {money(item.amount)}
                            </td>

                            <td className="px-6 py-4 text-white/90">
                              {money(item.deductedAmount || item.amount)}
                              {Number(item.feeAmount) > 0 && (
                                <div className="mt-1 text-xs text-blue-100/60">
                                  fee {money(item.feeAmount)} (
                                  {Number(item.feePercentage || 0)}%)
                                </div>
                              )}
                            </td>

                            <td className="break-all px-6 py-4 text-sm text-white/80">
                              {item.withdrawalId || "—"}
                            </td>

                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${statusChip(
                                  item.status,
                                )}`}
                              >
                                <FaCircle
                                  className={`text-[10px] ${statusDot(
                                    item.status,
                                  )}`}
                                />
                                {s}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-2">
                                {canReject && (
                                  <button
                                    type="button"
                                    onClick={() => setRejectId(item._id)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-[12px] font-extrabold text-red-200 transition hover:bg-red-500/20"
                                  >
                                    <FaBan />
                                    Reject
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedId(isExpanded ? "" : item._id)
                                  }
                                  className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 p-2.5 text-blue-100 transition hover:bg-white/10"
                                >
                                  {isExpanded ? (
                                    <FaChevronUp />
                                  ) : (
                                    <FaChevronDown />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-black/25 p-0">
                                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-3">
                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaMoneyBillWave />
                                      Transaction
                                    </div>
                                    <FieldRow k="Amount" v={money(item.amount)} />
                                    <FieldRow
                                      k="Fee"
                                      v={`${money(item.feeAmount)} (${Number(
                                        item.feePercentage || 0,
                                      )}%)`}
                                    />
                                    <FieldRow
                                      k="Deducted By Gateway"
                                      v={money(item.deductedAmount)}
                                    />
                                    <FieldRow
                                      k="Balance Before"
                                      v={money(item.balanceBefore)}
                                    />
                                    <FieldRow
                                      k="Balance After"
                                      v={money(item.balanceAfter)}
                                    />
                                  </div>

                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaUser />
                                      User & Review
                                    </div>
                                    <FieldRow
                                      k="User ID"
                                      v={item.userDbUserId || "Unknown"}
                                    />
                                    <FieldRow k="Phone" v={item.userPhone || "—"} />
                                    <FieldRow
                                      k="Withdrawal ID"
                                      v={item.withdrawalId || "—"}
                                    />
                                    <FieldRow k="Reason" v={item.reason || "—"} />
                                    <FieldRow
                                      k="Completed At"
                                      v={
                                        item.completedAt
                                          ? new Date(
                                              item.completedAt,
                                            ).toLocaleString()
                                          : "—"
                                      }
                                    />
                                  </div>

                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaImage />
                                      Proof Images
                                    </div>

                                    {Array.isArray(item.proofImages) &&
                                    item.proofImages.length ? (
                                      <div className="grid grid-cols-3 gap-2">
                                        {item.proofImages.map((src, idx) => (
                                          <a
                                            key={idx}
                                            href={src}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block overflow-hidden rounded-xl border border-blue-200/15"
                                          >
                                            <img
                                              src={src}
                                              alt={`proof-${idx}`}
                                              className="h-16 w-full object-cover"
                                            />
                                          </a>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-blue-100/50">
                                        No proof images yet
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col gap-4 border-t border-blue-200/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-blue-100/65">
                    Showing{" "}
                    <span className="font-black text-white">
                      {(page - 1) * limit + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-black text-white">
                      {Math.min(page * limit, pagination.total)}
                    </span>{" "}
                    of{" "}
                    <span className="font-black text-white">
                      {pagination.total}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPageChange(page - 1)}
                      disabled={page === 1}
                      className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <div className="rounded-xl border border-blue-200/15 bg-black/35 px-4 py-2 text-blue-100">
                      Page <span className="font-black text-white">{page}</span>{" "}
                      / <span className="font-black text-white">{totalPages}</span>
                    </div>
                    <button
                      onClick={() => onPageChange(page + 1)}
                      disabled={page === totalPages}
                      className="cursor-pointer rounded-xl border border-blue-200/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {rejectId ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => (!rejecting ? setRejectId("") : null)}
          />

          <div className="relative w-full max-w-md rounded-[28px] border border-red-300/20 bg-gradient-to-br from-black via-[#2f79c9]/20 to-black p-6 text-white shadow-2xl">
            <div className="text-2xl font-black">Reject & Refund?</div>
            <div className="mt-2 text-sm text-blue-100/70">
              এই withdraw reject করলে user এর balance ফেরত যাবে। শুধু তখনই
              করো যদি gateway আর callback না পাঠায়।
            </div>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className={`${inputClass} mt-4`}
            />

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={rejecting}
                onClick={() => setRejectId("")}
                className="cursor-pointer rounded-2xl border border-blue-200/15 bg-white/5 px-4 py-3 font-bold transition hover:bg-white/10 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={rejecting}
                onClick={confirmReject}
                className="cursor-pointer rounded-2xl bg-red-500 px-4 py-3 font-extrabold text-white transition hover:bg-red-400 disabled:opacity-60"
              >
                {rejecting ? "Processing..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AutoWithdrawHistory;
