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
  FaReceipt,
  FaUser,
  FaPhoneAlt,
  FaCircle,
  FaGift,
  FaPercentage,
  FaMoneyBillWave,
  FaCoins,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaBullseye,
  FaMobileAlt,
  FaExclamationTriangle,
  FaCheck,
  FaTimes,
} from "react-icons/fa";

const money = (n) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return "৳ 0.00";

  return `৳ ${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getAmount = (item) => {
  return Number(item?.calc?.creditedAmount || item?.amount || 0);
};

const emptySummary = {
  paidAmount: 0,
  pendingAmount: 0,
  failedAmount: 0,
  paidCount: 0,
  pendingCount: 0,
  failedCount: 0,
  reviewCount: 0,
};

const buildFallbackSummary = (items = []) => {
  return items.reduce(
    (acc, item) => {
      const st = String(item?.status || "PENDING").toUpperCase();
      const amount = getAmount(item);

      if (st === "PAID") {
        acc.paidAmount += amount;
        acc.paidCount += 1;
      } else if (st === "FAILED") {
        acc.failedAmount += amount;
        acc.failedCount += 1;
      } else {
        acc.pendingAmount += amount;
        acc.pendingCount += 1;
      }

      return acc;
    },
    { ...emptySummary },
  );
};

const normalizeSummary = (serverSummary, list) => {
  const fallback = buildFallbackSummary(list);

  if (!serverSummary || typeof serverSummary !== "object") {
    return fallback;
  }

  return {
    paidAmount: Number(serverSummary.paidAmount ?? fallback.paidAmount),
    pendingAmount: Number(
      serverSummary.pendingAmount ?? fallback.pendingAmount,
    ),
    failedAmount: Number(serverSummary.failedAmount ?? fallback.failedAmount),
    paidCount: Number(serverSummary.paidCount ?? fallback.paidCount),
    pendingCount: Number(serverSummary.pendingCount ?? fallback.pendingCount),
    failedCount: Number(serverSummary.failedCount ?? fallback.failedCount),
    reviewCount: Number(serverSummary.reviewCount || 0),
  };
};

const statusChip = (status) => {
  const s = String(status || "PENDING").toUpperCase();

  if (s === "PAID") {
    return "bg-emerald-500/15 text-emerald-200 border-emerald-300/25";
  }

  if (s === "FAILED") {
    return "bg-red-500/15 text-red-200 border-red-300/25";
  }

  return "bg-yellow-500/15 text-yellow-200 border-yellow-300/25";
};

const statusDot = (status) => {
  const s = String(status || "PENDING").toUpperCase();

  if (s === "PAID") return "text-emerald-300";
  if (s === "FAILED") return "text-red-300";

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

const MfsDepositHistory = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState("");

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

  // Confirm / reject a pending payment by hand: { type, item }
  const [action, setAction] = useState(null);
  const [actionTrx, setActionTrx] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState(false);

  const page = pagination.page;
  const limit = pagination.limit;
  const totalPages = pagination.totalPages;

  const goUserDetails = (item) => {
    const userMongoId = String(item?.user?._id || item?.user || "");

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

      const params = {
        page: p,
        limit: l,
      };

      if (qv) params.q = qv;
      if (sv !== "ALL") params.status = sv;

      const { data } = await api.get("/api/mfs-deposit/deposits/admin", {
        params,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Fetch failed");
      }

      const list = Array.isArray(data?.data) ? data.data : [];

      setRows(list);
      setSummary(normalizeSummary(data?.summary, list));

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

    fetchData({
      page: 1,
      qv: query,
      sv: status,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setExpandedId("");

    await fetchData({
      page,
      qv: q,
      sv: status,
    });

    toast.info("Refreshed");
  };

  const onChangeStatus = (val) => {
    setStatus(val);
    setExpandedId("");

    fetchData({
      page: 1,
      qv: q,
      sv: val,
    });
  };

  const onChangeLimit = (val) => {
    setExpandedId("");

    fetchData({
      page: 1,
      limit: Number(val || 20),
      qv: q,
      sv: status,
    });
  };

  const onPageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;

    setExpandedId("");

    fetchData({
      page: newPage,
      qv: q,
      sv: status,
    });
  };

  const openAction = (type, item) => {
    setAction({ type, item });
    setActionTrx("");
    setActionNote("");
  };

  const submitAction = async () => {
    if (!action?.item?._id) return;

    try {
      setActing(true);

      const { data } = await api.post(
        `/api/mfs-deposit/deposits/${action.item._id}/${action.type}`,
        { transactionId: actionTrx.trim(), note: actionNote.trim() },
      );

      toast.success(data?.message || "Done");
      setAction(null);
      setExpandedId("");

      await fetchData({ page, qv: q, sv: status });
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed");
    } finally {
      setActing(false);
    }
  };

  const headerStats = useMemo(() => {
    return {
      total: Number(pagination.total || 0),
      showing: Array.isArray(rows) ? rows.length : 0,
    };
  }, [pagination.total, rows]);

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[28px] border border-blue-200/15 bg-gradient-to-r from-black/80 via-[#2f79c9]/40 to-black/80 text-white shadow-[0_20px_80px_rgba(47,121,201,0.22)] backdrop-blur-xl">
          <div className="px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/40">
                  <FaReceipt className="text-2xl text-white" />
                </div>

                <div>
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    Personal Auto Deposit History
                  </h1>
                  <p className="mt-1 text-sm font-medium text-blue-100/75">
                    MFSWallet payments — confirm or reject the ones the gateway
                    could not match.
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => onChangeStatus("REVIEW")}
            className={`cursor-pointer rounded-[24px] border p-5 text-left shadow-lg shadow-blue-900/20 transition ${
              summary?.reviewCount > 0
                ? "border-red-300/40 bg-gradient-to-br from-black/80 via-red-500/20 to-black/80"
                : "border-blue-200/15 bg-gradient-to-br from-black/80 via-[#2f79c9]/20 to-black/80"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide text-blue-100/55">
                  Needs Review
                </div>
                <div className="mt-2 text-2xl font-black text-red-300">
                  {Number(summary?.reviewCount || 0)}
                </div>
                <div className="mt-2 text-sm font-semibold text-blue-100/65">
                  Click to show them
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200/15 bg-black/45 text-xl text-red-300">
                <FaExclamationTriangle />
              </div>
            </div>
          </button>

          <SummaryCard
            title="Total Paid"
            amount={summary?.paidAmount}
            count={summary?.paidCount}
            icon={<FaCheckCircle />}
            colorClass="text-emerald-300"
          />

          <SummaryCard
            title="Total Pending"
            amount={summary?.pendingAmount}
            count={summary?.pendingCount}
            icon={<FaClock />}
            colorClass="text-yellow-300"
          />

          <SummaryCard
            title="Total Failed"
            amount={summary?.failedAmount}
            count={summary?.failedCount}
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
                placeholder="Search by userId / invoice / short code / transaction / sender"
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
                <option value="REVIEW">NEEDS REVIEW</option>
                <option value="PENDING">PENDING</option>
                <option value="PAID">PAID</option>
                <option value="FAILED">FAILED</option>
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
                <table className="w-full min-w-[1250px] border-collapse text-left">
                  <thead>
                    <tr className="bg-black/35 text-sm text-blue-100/85">
                      <th className="px-6 py-4 font-extrabold">Invoice</th>
                      <th className="px-6 py-4 font-extrabold">User</th>
                      <th className="px-6 py-4 font-extrabold">Method</th>
                      <th className="px-6 py-4 font-extrabold">Deposit</th>
                      <th className="px-6 py-4 font-extrabold">Bonus</th>
                      <th className="px-6 py-4 font-extrabold">Credited</th>
                      <th className="px-6 py-4 font-extrabold">Turnover</th>
                      <th className="px-6 py-4 font-extrabold">Status</th>
                      <th className="px-6 py-4 text-right font-extrabold">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((item) => {
                      const isExpanded = expandedId === item._id;

                      const bonusType = item?.selectedBonus?.bonusType || "";
                      const bonusScope = item?.selectedBonus?.bonusScope || "";
                      const bonusTitle =
                        item?.selectedBonus?.title?.en ||
                        item?.selectedBonus?.title?.bn ||
                        "No Bonus";

                      return (
                        <React.Fragment key={item._id}>
                          <tr className="border-b border-blue-200/8 hover:bg-white/[0.03]">
                            <td className="break-all px-6 py-4 text-sm font-bold text-white/90">
                              {item.invoiceNumber || "—"}
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="inline-flex items-center gap-2">
                                  <FaUser className="text-[#8fc2f5]" />

                                  <button
                                    type="button"
                                    onClick={() => goUserDetails(item)}
                                    className="cursor-pointer font-extrabold text-white/90 underline decoration-blue-300/40 underline-offset-4 transition hover:text-[#8fc2f5]"
                                    title="View user details"
                                  >
                                    {item.user?.userId || item.userIdText || "Unknown"}
                                  </button>
                                </div>

                                <div className="inline-flex items-center gap-2 text-[12px] text-blue-100/65">
                                  <FaPhoneAlt className="text-[#8fc2f5]" />
                                  <span>{item.user?.phone || "—"}</span>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <span className="inline-flex items-center gap-2 text-sm font-black uppercase text-white/90">
                                <FaMobileAlt className="text-[#8fc2f5]" />
                                {item.method || "—"}
                              </span>
                            </td>

                            <td className="px-6 py-4 font-extrabold text-[#8fc2f5]">
                              {money(item.amount)}
                            </td>

                            <td className="px-6 py-4">
                              <div className="inline-flex items-center gap-2 text-sm font-bold text-white/85">
                                {bonusType === "percent" ? (
                                  <FaPercentage className="text-[#8fc2f5]" />
                                ) : (
                                  <FaGift className="text-[#8fc2f5]" />
                                )}

                                {bonusTitle}
                              </div>

                              <div className="mt-1 text-xs text-blue-100/60">
                                {bonusType === "percent"
                                  ? `${Number(
                                      item?.selectedBonus?.bonusValue || 0,
                                    )}%`
                                  : money(item?.selectedBonus?.bonusValue || 0)}
                                {" | "}+{money(item?.calc?.bonusAmount || 0)}
                              </div>

                              <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-blue-100/70">
                                <FaBullseye />
                                {bonusScope === "first-deposit"
                                  ? "First Deposit"
                                  : bonusScope === "all-time"
                                    ? "All Time"
                                    : "No Scope"}
                              </div>
                            </td>

                            <td className="px-6 py-4 font-extrabold text-emerald-300">
                              {money(item?.calc?.creditedAmount || item.amount)}
                            </td>

                            <td className="px-6 py-4 text-white/90">
                              x{Number(item?.calc?.turnoverMultiplier ?? 1)} /{" "}
                              {money(item?.calc?.targetTurnover ?? item.amount)}
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

                                {String(item.status || "PENDING").toUpperCase()}
                              </span>

                              {item.status === "PENDING" && item.needsReview ? (
                                <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-red-300/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-black text-red-200">
                                  <FaExclamationTriangle />
                                  NEEDS REVIEW
                                </div>
                              ) : null}
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex items-center justify-end gap-3">
                                {item.status === "PENDING" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openAction("confirm", item)}
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-300/25 bg-emerald-500/15 px-3 py-2 text-[12px] font-extrabold text-emerald-200 transition hover:bg-emerald-500/25"
                                    >
                                      <FaCheck className="text-[11px]" />
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openAction("reject", item)}
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-[12px] font-extrabold text-red-200 transition hover:bg-red-500/25"
                                    >
                                      <FaTimes className="text-[11px]" />
                                      Reject
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-[12px] text-blue-100/35">
                                    {item.reviewedBy?.email ? `by ${item.reviewedBy.email}` : "—"}
                                  </span>
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
                              <td colSpan={9} className="bg-black/25 p-0">
                                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-4">
                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaMoneyBillWave />
                                      Payment
                                    </div>

                                    <FieldRow
                                      k="Invoice"
                                      v={item.invoiceNumber || "—"}
                                    />
                                    <FieldRow
                                      k="Deposit Amount"
                                      v={money(item.amount)}
                                    />
                                    <FieldRow
                                      k="Method"
                                      v={String(item.method || "—").toUpperCase()}
                                    />
                                    <FieldRow
                                      k="Status"
                                      v={item.status || "—"}
                                    />
                                    <FieldRow
                                      k="Paid At"
                                      v={
                                        item.paidAt
                                          ? new Date(
                                              item.paidAt,
                                            ).toLocaleString()
                                          : "—"
                                      }
                                    />
                                  </div>

                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaGift />
                                      Bonus & Turnover
                                    </div>

                                    <FieldRow k="Bonus Title" v={bonusTitle} />
                                    <FieldRow
                                      k="Bonus Type"
                                      v={
                                        item?.selectedBonus?.bonusType || "none"
                                      }
                                    />
                                    <FieldRow
                                      k="Bonus Scope"
                                      v={
                                        item?.selectedBonus?.bonusScope ||
                                        "none"
                                      }
                                    />
                                    <FieldRow
                                      k="Bonus Value"
                                      v={
                                        item?.selectedBonus?.bonusType ===
                                        "percent"
                                          ? `${Number(
                                              item?.selectedBonus?.bonusValue ||
                                                0,
                                            )}%`
                                          : money(
                                              item?.selectedBonus?.bonusValue ||
                                                0,
                                            )
                                      }
                                    />
                                    <FieldRow
                                      k="Bonus Amount"
                                      v={money(item?.calc?.bonusAmount || 0)}
                                    />
                                    <FieldRow
                                      k="Credited Amount"
                                      v={money(
                                        item?.calc?.creditedAmount ||
                                          item.amount,
                                      )}
                                    />
                                    <FieldRow
                                      k="Target Turnover"
                                      v={money(
                                        item?.calc?.targetTurnover ||
                                          item.amount,
                                      )}
                                    />
                                  </div>

                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaReceipt />
                                      Transaction
                                    </div>

                                    <FieldRow
                                      k="Transaction ID"
                                      v={
                                        item.transactionId || item.trxid || "—"
                                      }
                                    />
                                    <FieldRow
                                      k="Short Code"
                                      v={item.shortCode || "—"}
                                    />
                                    <FieldRow
                                      k="Sender Number"
                                      v={item.senderNumber || "—"}
                                    />
                                    <FieldRow
                                      k="Gateway Message"
                                      v={item.gatewayMessage || "—"}
                                    />
                                    <FieldRow
                                      k="Balance Added"
                                      v={item.balanceAdded ? "YES" : "NO"}
                                    />
                                    <FieldRow
                                      k="Reviewed"
                                      v={
                                        item.reviewedBy?.email
                                          ? `${item.reviewedBy.email}${item.reviewNote ? ` — ${item.reviewNote}` : ""}`
                                          : "—"
                                      }
                                    />
                                  </div>

                                  <div className="rounded-3xl border border-blue-200/12 bg-white/5 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#8fc2f5]">
                                      <FaCoins />
                                      User & Affiliate
                                    </div>

                                    <FieldRow
                                      k="User ID"
                                      v={
                                        <button
                                          type="button"
                                          onClick={() => goUserDetails(item)}
                                          className="cursor-pointer font-black text-[#8fc2f5] underline decoration-blue-300/40 underline-offset-4 transition hover:text-white"
                                        >
                                          {item.user?.userId || item.userIdText || "Unknown"}
                                        </button>
                                      }
                                    />
                                    <FieldRow
                                      k="Phone"
                                      v={item.user?.phone || "—"}
                                    />
                                    <FieldRow
                                      k="Role"
                                      v={item.user?.role || "user"}
                                    />
                                    <FieldRow
                                      k="Affiliator User ID"
                                      v={
                                        item?.calc?.affiliateDepositCommission
                                          ?.affiliatorUserId || "—"
                                      }
                                    />
                                    <FieldRow
                                      k="Affiliate Percent"
                                      v={`${
                                        Number(
                                          item?.calc?.affiliateDepositCommission
                                            ?.percent || 0,
                                        ) || 0
                                      }%`}
                                    />
                                    <FieldRow
                                      k="Affiliate Commission"
                                      v={money(
                                        item?.calc?.affiliateDepositCommission
                                          ?.commissionAmount || 0,
                                      )}
                                    />
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
                      /{" "}
                      <span className="font-black text-white">
                        {totalPages}
                      </span>
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

      {action ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !acting && setAction(null)}
          />

          <div
            className={`relative w-full max-w-md rounded-[28px] border bg-gradient-to-br from-black via-[#2f79c9]/20 to-black p-6 text-white shadow-2xl ${
              action.type === "confirm" ? "border-emerald-300/20" : "border-red-300/20"
            }`}
          >
            <div className="text-2xl font-black">
              {action.type === "confirm" ? "Confirm Deposit?" : "Reject Deposit?"}
            </div>
            <div className="mt-2 text-sm text-blue-100/70">
              {action.type === "confirm"
                ? `${money(action.item?.calc?.creditedAmount || action.item?.amount)} will be added to ${action.item?.user?.userId || action.item?.userIdText}'s balance. Check that the money really arrived in your ${String(action.item?.method || "").toUpperCase()} account first.`
                : "এই deposit টা FAILED হয়ে যাবে, balance এ কিছু যোগ হবে না।"}
            </div>

            {action.type === "confirm" ? (
              <input
                value={actionTrx}
                onChange={(e) => setActionTrx(e.target.value)}
                placeholder="Transaction ID (optional)"
                className="mt-4 w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-blue-100/35 focus:border-[#63a8ee]"
              />
            ) : null}

            <input
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="Note (optional)"
              className="mt-3 w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-blue-100/35 focus:border-[#63a8ee]"
            />

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={acting}
                onClick={() => setAction(null)}
                className="cursor-pointer rounded-2xl border border-blue-200/15 bg-white/5 px-4 py-3 font-bold transition hover:bg-white/10 disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={acting}
                onClick={submitAction}
                className={`cursor-pointer rounded-2xl px-4 py-3 font-extrabold text-white transition disabled:opacity-60 ${
                  action.type === "confirm" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"
                }`}
              >
                {acting ? "Working..." : action.type === "confirm" ? "Confirm & Credit" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MfsDepositHistory;
