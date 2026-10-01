import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { api } from "../../api/axios";
import {
  FaCog,
  FaKey,
  FaToggleOn,
  FaToggleOff,
  FaSave,
  FaSyncAlt,
  FaShieldAlt,
  FaMoneyBillWave,
  FaImage,
  FaMobileAlt,
} from "react-icons/fa";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

const cardClass =
  "rounded-3xl border border-blue-200/15 bg-black/30 backdrop-blur-xl shadow-[0_20px_80px_rgba(47,121,201,0.18)]";

const inputClass =
  "w-full rounded-2xl border border-blue-200/15 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-[#63a8ee] focus:ring-2 focus:ring-[#2f79c9]/25 placeholder:text-blue-100/35";

const labelClass =
  "text-[12px] font-extrabold uppercase tracking-wide text-blue-100/70";

const getImageUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${import.meta.env.VITE_API_URL || ""}${url}`;
};

const emptyMethods = [
  { code: "bkash", name: { bn: "বিকাশ", en: "bKash" } },
  { code: "nagad", name: { bn: "নগদ", en: "Nagad" } },
  { code: "rocket", name: { bn: "রকেট", en: "Rocket" } },
  { code: "upay", name: { bn: "উপায়", en: "Upay" } },
].map((m, idx) => ({
  ...m,
  logoUrl: "",
  isActive: true,
  order: idx,
  minimumWithdrawAmount: 0,
  maximumWithdrawAmount: 0,
}));

const AutoWithdrawSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [methods, setMethods] = useState(emptyMethods);
  const [uploadingCode, setUploadingCode] = useState("");

  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      businessToken: "",
      active: false,
      minAmount: 500,
      maxAmount: 50000,
    },
  });

  const active = watch("active");

  const loadSettings = async () => {
    try {
      setLoading(true);

      const { data } = await api.get("/api/auto-withdraw/admin");

      if (!data?.success) {
        throw new Error(data?.message || "Failed to load settings");
      }

      reset({
        businessToken: data?.data?.businessToken || "",
        active: !!data?.data?.active,
        minAmount: Number(data?.data?.minAmount || 500),
        maxAmount: Number(data?.data?.maxAmount || 50000),
      });

      setMethods(
        Array.isArray(data?.data?.methods) && data.data.methods.length
          ? data.data.methods
          : emptyMethods,
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Load failed",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateMethod = (code, key, value) => {
    setMethods((prev) =>
      prev.map((item) => {
        if (item.code !== code) return item;

        if (key === "name.bn" || key === "name.en") {
          const lang = key.split(".")[1];
          return { ...item, name: { ...item.name, [lang]: value } };
        }

        return { ...item, [key]: value };
      }),
    );
  };

  const uploadLogo = async (code, file) => {
    if (!file) return;

    try {
      setUploadingCode(code);

      const fd = new FormData();
      fd.append("logo", file);

      const { data } = await api.post("/api/auto-withdraw/admin/upload-logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!data?.success) {
        throw new Error(data?.message || "Upload failed");
      }

      updateMethod(code, "logoUrl", data.url);
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Upload failed",
      );
    } finally {
      setUploadingCode("");
    }
  };

  const onSubmit = async (values) => {
    try {
      setSaving(true);

      const min = Math.floor(Number(values.minAmount || 0));
      const max = Math.floor(Number(values.maxAmount || 0));

      if (!min || min < 1) {
        toast.error("Minimum amount invalid");
        return;
      }

      if (max > 0 && min > max) {
        toast.error("Minimum cannot be greater than maximum");
        return;
      }

      const { data } = await api.put("/api/auto-withdraw/admin", {
        businessToken: String(values.businessToken || "").trim(),
        active: !!values.active,
        minAmount: min,
        maxAmount: max,
        methods,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Save failed");
      }

      toast.success("Auto withdraw settings updated");
      await loadSettings();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.message || "Save failed",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className={`${cardClass} p-8 text-center text-blue-100`}>
          Loading auto withdraw settings...
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
                  <FaCog className="text-2xl text-white" />
                </div>

                <div>
                  <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                    Auto Withdraw Settings
                  </h1>
                  <p className="mt-1 text-sm font-medium text-blue-100/75">
                    Manage OraclePay token, withdraw limits and bKash/Nagad/
                    Rocket/Upay methods.
                  </p>
                </div>
              </div>

              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black ${
                  active
                    ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                    : "border-red-300/30 bg-red-400/15 text-red-200"
                }`}
              >
                {active ? <FaToggleOn /> : <FaToggleOff />}
                {active ? "AUTO WITHDRAW ACTIVE" : "AUTO WITHDRAW INACTIVE"}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className={`${cardClass} p-5 md:p-6`}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/30">
                  <FaKey className="text-lg text-white" />
                </div>

                <div>
                  <div className="text-lg font-black">Business Token</div>
                  <div className="text-xs font-medium text-blue-100/65">
                    OraclePay business token for auto withdraw API.
                  </div>
                </div>
              </div>

              <div className="relative mt-5">
                <input
                  {...register("businessToken")}
                  type={showToken ? "text" : "password"}
                  placeholder="Paste your business token"
                  className={`${inputClass} pr-14 font-mono text-sm`}
                />

                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl border border-blue-200/15 bg-white/5 text-blue-100 transition hover:bg-white/10"
                >
                  {showToken ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-blue-200/10 bg-gradient-to-r from-[#63a8ee]/10 to-[#2f79c9]/10 p-4">
                <label className="inline-flex cursor-pointer items-center gap-3 font-bold text-white">
                  <input
                    type="checkbox"
                    {...register("active")}
                    className="h-5 w-5 cursor-pointer accent-[#2f79c9]"
                  />
                  <span>Enable Auto Withdraw</span>
                </label>

                <p className="mt-2 text-sm text-blue-100/65">
                  When enabled, users can request automatic bKash/Nagad/
                  Rocket/Upay withdrawals.
                </p>
              </div>
            </div>

            <div className={`${cardClass} p-5 md:p-6`}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-700/30">
                  <FaMoneyBillWave className="text-lg text-white" />
                </div>

                <div>
                  <div className="text-lg font-black">Withdraw Limits</div>
                  <div className="text-xs font-medium text-blue-100/65">
                    Minimum and maximum allowed withdraw amount.
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelClass}>Minimum Amount</label>
                  <input
                    {...register("minAmount")}
                    type="number"
                    placeholder="Minimum withdraw amount"
                    className={`${inputClass} mt-2`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Maximum Amount</label>
                  <input
                    {...register("maxAmount")}
                    type="number"
                    placeholder="Maximum withdraw amount"
                    className={`${inputClass} mt-2`}
                  />
                </div>

                <div className="rounded-2xl border border-blue-200/10 bg-white/5 p-4 text-sm text-blue-100/70">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <FaShieldAlt className="text-[#8fc2f5]" />
                    Limit Note
                  </div>
                  <p className="mt-2">
                    If maximum amount is 0, it will be treated as unlimited.
                    Per-method limits below override these when stricter.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="border-b border-blue-200/10 px-5 py-5 md:px-6">
              <h2 className="text-xl font-black">Payment Methods</h2>
              <p className="mt-1 text-sm text-blue-100/65">
                Only bKash, Nagad, Rocket and Upay are supported by the
                gateway — these 4 codes are fixed.
              </p>
            </div>

            <div className="space-y-4 p-5 md:p-6">
              {methods.map((item) => (
                <div
                  key={item.code}
                  className="rounded-3xl border border-blue-200/12 bg-gradient-to-br from-black/35 via-[#2f79c9]/10 to-black/35 p-4 md:p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="flex flex-col items-center gap-2">
                      <label className="flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-blue-200/20 bg-black/30">
                        {item.logoUrl ? (
                          <img
                            src={getImageUrl(item.logoUrl)}
                            alt={item.code}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <FaImage className="text-xl text-[#8fc2f5]" />
                        )}

                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            uploadLogo(item.code, e.target.files?.[0] || null)
                          }
                        />
                      </label>

                      <span className="text-[10px] font-bold uppercase text-blue-100/55">
                        {uploadingCode === item.code
                          ? "Uploading..."
                          : "Logo"}
                      </span>
                    </div>

                    <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                      <div className="flex items-center gap-2 xl:col-span-1">
                        <FaMobileAlt className="text-[#8fc2f5]" />
                        <span className="text-sm font-black uppercase text-white">
                          {item.code}
                        </span>
                      </div>

                      <div>
                        <label className={labelClass}>Bangla Name</label>
                        <input
                          value={item.name?.bn || ""}
                          onChange={(e) =>
                            updateMethod(item.code, "name.bn", e.target.value)
                          }
                          className={`${inputClass} mt-2`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>English Name</label>
                        <input
                          value={item.name?.en || ""}
                          onChange={(e) =>
                            updateMethod(item.code, "name.en", e.target.value)
                          }
                          className={`${inputClass} mt-2`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Min Amount</label>
                        <input
                          type="number"
                          value={item.minimumWithdrawAmount}
                          onChange={(e) =>
                            updateMethod(
                              item.code,
                              "minimumWithdrawAmount",
                              Number(e.target.value || 0),
                            )
                          }
                          className={`${inputClass} mt-2`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Max Amount</label>
                        <input
                          type="number"
                          value={item.maximumWithdrawAmount}
                          onChange={(e) =>
                            updateMethod(
                              item.code,
                              "maximumWithdrawAmount",
                              Number(e.target.value || 0),
                            )
                          }
                          className={`${inputClass} mt-2`}
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-blue-200/15 bg-white/5 px-3 py-2.5 text-sm font-bold">
                          <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(e) =>
                              updateMethod(
                                item.code,
                                "isActive",
                                e.target.checked,
                              )
                            }
                            className="h-4 w-4 cursor-pointer accent-[#2f79c9]"
                          />
                          <span>{item.isActive ? "Active" : "Inactive"}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={loadSettings}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-blue-200/15 bg-black/35 px-5 py-3 font-extrabold text-blue-50 transition hover:bg-white/10"
            >
              <FaSyncAlt />
              Refresh
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] px-6 py-3 font-extrabold text-white shadow-lg shadow-blue-700/30 transition hover:from-[#7bb7f1] hover:to-[#3b88db] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaSave />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AutoWithdrawSettings;
