import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { FaFilter, FaSave, FaSyncAlt } from "react-icons/fa";
import { api } from "../../api/axios";

const sectionCard =
  "rounded-2xl border border-blue-300/20 bg-gradient-to-br from-black via-[#2f79c9]/20 to-black shadow-lg shadow-blue-900/20";

const btnBase =
  "cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60";

const btnPrimary = `${btnBase} bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] text-white hover:from-[#7bb7f1] hover:to-[#3b88db] shadow-lg shadow-blue-700/30`;

const btnGhost = `${btnBase} border border-blue-300/20 bg-black/30 text-blue-100 hover:bg-blue-900/20`;

const TurnoverProviderSetting = () => {
  const qc = useQueryClient();
  // Map of providerCode -> percent (0-100). Presence as a key = selected.
  const [providerPercents, setProviderPercents] = useState({});
  const [saving, setSaving] = useState(false);

  const {
    data: providersRes,
    isLoading: providersLoading,
    isError: providersError,
    error: providersErrorObj,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: ["turnover-provider-setting-providers"],
    queryFn: async () => {
      const res = await api.get("/api/admin/game-api-key/admin/providers");
      return res.data;
    },
    retry: false,
  });

  // Live list from the master API (only works while the game key is
  // active/verified) — this is the "mother panel" source of truth, not our
  // locally-synced GameProvider collection.
  const providers = Array.isArray(providersRes?.data) ? providersRes.data : [];

  const {
    data: settingRes,
    isLoading: settingLoading,
    refetch: refetchSetting,
  } = useQuery({
    queryKey: ["turnover-provider-setting"],
    queryFn: async () => {
      const res = await api.get("/api/turnover-provider-setting");
      return res.data;
    },
  });

  useEffect(() => {
    const eligible = settingRes?.data?.eligibleProviders || [];
    const next = {};

    eligible.forEach((item) => {
      const code = String(item?.providerCode || "").toUpperCase();
      if (!code) return;
      next[code] = Math.min(100, Math.max(0, Number(item?.percent ?? 100)));
    });

    setProviderPercents(next);
  }, [settingRes]);

  const loading = providersLoading || settingLoading;
  const selectedCount = Object.keys(providerPercents).length;

  const totalPercent = Object.values(providerPercents).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  const openPercent = Math.max(0, 100 - totalPercent);
  const overLimit = totalPercent > 100;

  const toggleProvider = (code) => {
    setProviderPercents((prev) => {
      const next = { ...prev };

      if (code in next) {
        delete next[code];
      } else {
        next[code] = 100;
      }

      return next;
    });
  };

  const setPercent = (code, value) => {
    const clamped = Math.min(100, Math.max(0, Number(value) || 0));

    setProviderPercents((prev) => ({
      ...prev,
      [code]: clamped,
    }));
  };

  const handleRefresh = () => {
    refetchProviders();
    refetchSetting();
  };

  const handleSave = async () => {
    if (overLimit) {
      toast.error("Selected providers' percent যোগফল ১০০%-এর বেশি হতে পারবে না");
      return;
    }

    try {
      setSaving(true);

      const eligibleProviders = Object.entries(providerPercents).map(
        ([providerCode, percent]) => ({ providerCode, percent }),
      );

      await api.put("/api/turnover-provider-setting", {
        eligibleProviders,
      });

      toast.success("Turnover provider setting saved");
      qc.invalidateQueries({ queryKey: ["turnover-provider-setting"] });
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to save setting",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className={`${sectionCard} p-5 lg:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-500/40">
                <FaFilter className="text-2xl text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">
                  Turnover Eligible Providers
                </h1>
                <p className="text-sm text-blue-100/80">
                  প্রতিটা provider-এর percent মানে হলো প্রতিটা turnover-এর
                  একটা নির্দিষ্ট অংশ, যেটা <b>শুধু ওই provider খেলেই</b>{" "}
                  পূরণ করতে হবে (যেমন ৫০%+৫০% দিলে পুরোটাই দুই provider-এ
                  ভাগ হয়ে যাবে)। যোগফল ১০০%-এর কম হলে বাকিটা যেকোনো
                  provider খেলেই পূরণ করা যাবে। কিছু select না করলে সব
                  provider ১০০%-ই unrestricted থাকবে। Provider list মাস্টার
                  প্যানেল থেকে লাইভ লোড হয় — game API key active থাকতে হবে।
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                className={btnGhost}
              >
                <span className="flex items-center gap-2">
                  <FaSyncAlt />
                  Refresh
                </span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving || overLimit}
                className={btnPrimary}
              >
                <span className="flex items-center gap-2">
                  <FaSave />
                  {saving ? "Saving..." : "Save"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className={`${sectionCard} p-5 lg:p-6`}>
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Providers</h2>
              <p className="mt-1 text-sm text-blue-100/70">
                {selectedCount
                  ? `${selectedCount} provider(s) selected`
                  : "কোনো restriction নেই — সব provider unrestricted"}
              </p>
            </div>

            {selectedCount ? (
              <div
                className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                  overLimit
                    ? "border-red-400/40 bg-red-500/10 text-red-200"
                    : "border-blue-300/20 bg-black/30 text-blue-100"
                }`}
              >
                Dedicated: {totalPercent}%
                {overLimit
                  ? " — ১০০%-এর বেশি, কমাও"
                  : ` · Open (যেকোনো provider): ${openPercent}%`}
              </div>
            ) : null}
          </div>

          {providersError ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center text-sm text-red-200">
              {providersErrorObj?.response?.data?.message ||
                "Provider list লোড করা যায়নি। Game API key active/verified আছে কিনা দেখো।"}
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-xl bg-blue-300/10"
                />
              ))}
            </div>
          ) : providers.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {providers.map((provider) => {
                const code = String(
                  provider.providerCode || "",
                ).toUpperCase();
                if (!code) return null;

                const checked = code in providerPercents;
                const percent = providerPercents[code] ?? 100;

                return (
                  <div
                    key={code}
                    className={`rounded-xl border p-3 transition ${
                      checked
                        ? "border-[#63a8ee] bg-[#2f79c9]/20"
                        : "border-blue-300/20 bg-black/30 hover:bg-blue-900/10"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProvider(code)}
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[#63a8ee]"
                      />

                      {provider.providerIconUrl ? (
                        <img
                          src={provider.providerIconUrl}
                          alt={provider.providerName}
                          className="h-8 w-8 shrink-0 rounded object-contain"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded bg-blue-300/10" />
                      )}

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {provider.providerName}
                        </p>
                        <p className="truncate text-xs text-blue-100/60">
                          {code}
                        </p>
                      </div>
                    </label>

                    {checked && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={percent}
                          onChange={(e) => setPercent(code, e.target.value)}
                          className="h-8 w-full rounded-lg border border-blue-300/20 bg-black/40 px-2 text-sm text-white outline-none focus:border-[#63a8ee]"
                        />
                        <span className="text-sm font-semibold text-blue-100/70">
                          %
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-blue-100/60">No providers found.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TurnoverProviderSetting;
