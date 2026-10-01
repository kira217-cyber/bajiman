import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  FaTools,
  FaSave,
  FaSyncAlt,
  FaImage,
  FaExclamationTriangle,
} from "react-icons/fa";
import { api } from "../../api/axios";

const sectionCard =
  "rounded-2xl border border-blue-300/20 bg-gradient-to-br from-black via-[#2f79c9]/20 to-black shadow-lg shadow-blue-900/20";

const btnBase =
  "cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60";

const btnPrimary = `${btnBase} bg-gradient-to-r from-[#63a8ee] to-[#2f79c9] text-white hover:from-[#7bb7f1] hover:to-[#3b88db] shadow-lg shadow-blue-700/30`;

const btnGhost = `${btnBase} border border-blue-300/20 bg-black/30 text-blue-100 hover:bg-blue-900/20`;

const btnDanger = `${btnBase} border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20`;

const btnSuccess = `${btnBase} border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20`;

const ImageUploadCard = ({
  title,
  subtitle,
  sizeHint,
  previewUrl,
  onFileChange,
  onSave,
  saving,
  hasFile,
}) => (
  <div className={`${sectionCard} p-5 lg:p-6`}>
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1A79D3]/20">
        <FaImage className="text-lg text-[#3ea0ff]" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-xs text-blue-100/70">{subtitle}</p>
      </div>
    </div>

    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-300/30 bg-black/30 p-3 text-center transition hover:border-[#3ea0ff] hover:bg-[#1A79D3]/10">
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={title}
          className="max-h-[220px] w-full rounded-lg object-contain"
        />
      ) : (
        <div className="flex h-[160px] w-full flex-col items-center justify-center rounded-lg bg-black/30">
          <FaImage className="mb-2 text-3xl text-[#3ea0ff]" />
          <p className="text-sm font-bold text-slate-200">ছবি আপলোড করো</p>
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        className="hidden"
      />
    </label>

    <p className="mt-2 text-xs text-blue-100/60">প্রস্তাবিত সাইজ: {sizeHint}</p>

    <button
      type="button"
      onClick={onSave}
      disabled={!hasFile || saving}
      className={`${btnPrimary} mt-4 flex w-full items-center justify-center gap-2`}
    >
      <FaSave />
      {saving ? "Uploading..." : "Save Image"}
    </button>
  </div>
);

// One file-picker + preview per image field (clientImageDesktop,
// clientImageMobile, affiliateImageDesktop, affiliateImageMobile) — same
// shape repeated 4 times, so it's a hook instead of 4 copies of the same
// 3 useState + 1 useEffect block.
const useImageField = (currentUrl) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(currentUrl || "");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, currentUrl]);

  return { file, setFile, preview, saving, setSaving };
};

const MaintenanceSetting = () => {
  const qc = useQueryClient();

  const [toggling, setToggling] = useState(false);

  const {
    data: settingRes,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["maintenance-setting"],
    queryFn: async () => {
      const res = await api.get("/api/maintenance");
      return res.data;
    },
  });

  const setting = settingRes?.data || {};

  const clientDesktop = useImageField(setting.clientImageDesktopUrl);
  const clientMobile = useImageField(setting.clientImageMobileUrl);
  const affiliateDesktop = useImageField(setting.affiliateImageDesktopUrl);
  const affiliateMobile = useImageField(setting.affiliateImageMobileUrl);

  const handleToggle = async () => {
    const nextEnabled = !setting.enabled;

    if (nextEnabled) {
      const ok = window.confirm(
        "তুমি কি নিশ্চিত Maintenance Mode চালু করতে চাও? চালু করলে client আর affiliate সাইট পুরোপুরি বন্ধ হয়ে শুধু maintenance ছবি দেখাবে — সব user এর জন্য।",
      );
      if (!ok) return;
    }

    try {
      setToggling(true);
      await api.put("/api/maintenance/toggle", { enabled: nextEnabled });
      toast.success(
        nextEnabled
          ? "Maintenance Mode চালু হয়েছে"
          : "Maintenance Mode বন্ধ হয়েছে",
      );
      await qc.invalidateQueries({ queryKey: ["maintenance-setting"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Toggle failed");
    } finally {
      setToggling(false);
    }
  };

  const uploadImage = async (fieldName, field) => {
    try {
      field.setSaving(true);

      const fd = new FormData();
      fd.append(fieldName, field.file);

      await api.post("/api/maintenance/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("ছবি আপলোড হয়ে গেছে");
      field.setFile(null);
      await qc.invalidateQueries({ queryKey: ["maintenance-setting"] });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Upload failed");
    } finally {
      field.setSaving(false);
    }
  };

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className={`${sectionCard} p-5 lg:p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#63a8ee] to-[#2f79c9] shadow-lg shadow-blue-500/40">
                <FaTools className="text-2xl text-white" />
              </div>

              <div>
                <h1 className="text-2xl font-bold text-white">
                  Maintenance Mode
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-blue-100/80">
                  এখানে থেকে manually maintenance চালু/বন্ধ করা যাবে, আর
                  client/affiliate সাইটের জন্য আলাদা আলাদা maintenance ছবি
                  সেট করা যাবে। API-তে কোনো error হলে (server down/network
                  unreachable/5xx) client আর affiliate সাইট{" "}
                  <b>স্বয়ংক্রিয়ভাবে</b> এই ছবি দেখাতে শুরু করবে, admin
                  panel টাচ না করেও — API আবার ঠিক হয়ে গেলে নিজে থেকেই
                  normal সাইটে ফিরে যাবে।
                </p>
              </div>
            </div>

            <button type="button" onClick={() => refetch()} className={btnGhost}>
              <span className="flex items-center gap-2">
                <FaSyncAlt />
                Refresh
              </span>
            </button>
          </div>
        </div>

        <div className={`${sectionCard} p-5 lg:p-6`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  setting.enabled ? "bg-red-500/20" : "bg-emerald-500/20"
                }`}
              >
                <FaExclamationTriangle
                  className={`text-xl ${
                    setting.enabled ? "text-red-300" : "text-emerald-300"
                  }`}
                />
              </div>

              <div>
                <p className="text-lg font-bold text-white">
                  {isLoading
                    ? "Loading..."
                    : setting.enabled
                      ? "Maintenance Mode: ON (manually)"
                      : "Maintenance Mode: OFF"}
                </p>
                <p className="text-sm text-blue-100/70">
                  {setting.enabled
                    ? "এখন সবার জন্য maintenance ছবি দেখাচ্ছে"
                    : "সাইট স্বাভাবিকভাবে চলছে"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling || isLoading}
              className={setting.enabled ? btnDanger : btnSuccess}
            >
              {toggling
                ? "Updating..."
                : setting.enabled
                  ? "Turn OFF Maintenance"
                  : "Turn ON Maintenance"}
            </button>
          </div>
        </div>

        <div>
          <h2 className="mb-3 px-1 text-lg font-bold text-white">
            Client Site (bajiman.com)
          </h2>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImageUploadCard
              title="Desktop Image"
              subtitle="বড় স্ক্রিনে (ল্যাপটপ/পিসি) দেখাবে"
              sizeHint="1920 x 1080px (landscape)"
              previewUrl={clientDesktop.preview}
              onFileChange={clientDesktop.setFile}
              hasFile={Boolean(clientDesktop.file)}
              saving={clientDesktop.saving}
              onSave={() => uploadImage("clientImageDesktop", clientDesktop)}
            />

            <ImageUploadCard
              title="Mobile Image"
              subtitle="ফোনে দেখাবে"
              sizeHint="1080 x 1920px (full-screen পোর্ট্রেট)"
              previewUrl={clientMobile.preview}
              onFileChange={clientMobile.setFile}
              hasFile={Boolean(clientMobile.file)}
              saving={clientMobile.saving}
              onSave={() => uploadImage("clientImageMobile", clientMobile)}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 px-1 text-lg font-bold text-white">
            Affiliate Site (m-affiliate.bajiman.com)
          </h2>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImageUploadCard
              title="Desktop Image"
              subtitle="বড় স্ক্রিনে (ল্যাপটপ/পিসি) দেখাবে"
              sizeHint="1920 x 1080px (landscape)"
              previewUrl={affiliateDesktop.preview}
              onFileChange={affiliateDesktop.setFile}
              hasFile={Boolean(affiliateDesktop.file)}
              saving={affiliateDesktop.saving}
              onSave={() =>
                uploadImage("affiliateImageDesktop", affiliateDesktop)
              }
            />

            <ImageUploadCard
              title="Mobile Image"
              subtitle="ফোনে দেখাবে"
              sizeHint="1080 x 1920px (full-screen পোর্ট্রেট)"
              previewUrl={affiliateMobile.preview}
              onFileChange={affiliateMobile.setFile}
              hasFile={Boolean(affiliateMobile.file)}
              saving={affiliateMobile.saving}
              onSave={() => uploadImage("affiliateImageMobile", affiliateMobile)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceSetting;
