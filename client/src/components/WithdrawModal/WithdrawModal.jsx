import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2, Zap, Wallet as WalletIcon, Ban } from "lucide-react";
import { toast } from "react-toastify";
import { useSelector } from "react-redux";
import api from "../../api/axios";
import { useLanguage } from "../../Context/LanguageProvider";
import { selectModalColorSetting } from "../../features/global/globalSelectors";
import ManualWithdrawBody from "./ManualWithdrawBody";
import AutoWithdrawBody from "./AutoWithdrawBody";

const defaultModalColors = {
  modalBg: "#ffffff",
  pageOverlayBg: "rgba(0,0,0,0.45)",

  headerBg: "#0865a9",
  headerText: "#ffffff",
  closeIconColor: "#ffffff",

  primaryBg: "#0865a9",
  primaryText: "#ffffff",

  secondaryBg: "#2e9bf3",
  secondaryText: "#ffffff",

  inactiveTabBg: "#00518c",
  inactiveTabText: "#ffffff",

  sectionBg: "#eef4ff",
  sectionBorder: "#97b6e9",
  sectionText: "#2451cc",

  cardBg: "#ffffff",
  cardBorder: "#dce8f5",

  inputBg: "#eeeeee",
  inputText: "#222222",
  inputBorder: "#d7d7d7",
  inputFocusBorder: "#0865a9",

  labelText: "#333333",
  normalText: "#333333",
  mutedText: "#777777",

  summaryBg: "#eef7ff",
  summaryText: "#0865a9",

  disabledBg: "#a6a6a6",
  disabledText: "#ffffff",

  dangerBg: "#e95b5b",
  dangerText: "#ffffff",

  successBg: "#22c55e",
  successText: "#ffffff",
};

const WithdrawModal = ({ open, onClose, onHistoryClick, onDepositClick }) => {
  const { isBangla, language } = useLanguage();

  const modalColorSetting = useSelector(selectModalColorSetting);
  const colors = {
    ...defaultModalColors,
    ...(modalColorSetting || {}),
  };

  const t = {
    title: isBangla ? "উইথড্র" : "Withdraw",
    deposit: isBangla ? "ডিপোজিট" : "Deposit",
    loading: isBangla ? "লোড হচ্ছে..." : "Loading...",
    manualTitle: isBangla ? "ম্যানুয়াল উইথড্র" : "Manual Withdraw",
    manualDesc: isBangla
      ? "অ্যাডমিন রিভিউ করে অনুমোদন দেবে"
      : "Reviewed and approved by admin",
    autoTitle: isBangla ? "অটো উইথড্র" : "Auto Withdraw",
    autoDesc: isBangla
      ? "অনুমোদনের পর গেটওয়ে থেকে সরাসরি টাকা পাবেন"
      : "Sent directly by the gateway once approved",
    chooseMethod: isBangla ? "উইথড্র পদ্ধতি বেছে নিন" : "Choose Withdraw Method",
    closedTitle: isBangla ? "উইথড্র সাময়িকভাবে বন্ধ" : "Withdraw Temporarily Closed",
    closedDesc: isBangla
      ? "এই মুহূর্তে কোনো উইথড্র পদ্ধতি চালু নেই। অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।"
      : "No withdraw method is active right now. Please contact support.",
  };

  const [loadingModes, setLoadingModes] = useState(true);
  const [manualAvailable, setManualAvailable] = useState(false);
  const [autoAvailable, setAutoAvailable] = useState(false);
  const [mode, setMode] = useState(null); // null = gate, "manual", "auto"

  useEffect(() => {
    if (!open) {
      setMode(null);
      return;
    }

    let cancelled = false;

    const loadModes = async () => {
      try {
        setLoadingModes(true);

        const [methodsRes, autoRes] = await Promise.all([
          api.get("/api/withdraw-methods/public"),
          api.get("/api/auto-withdraw/status"),
        ]);

        if (cancelled) return;

        const manualOk = (methodsRes?.data?.data || []).length > 0;
        const autoOk = !!autoRes?.data?.data?.active;

        setManualAvailable(manualOk);
        setAutoAvailable(autoOk);

        if (manualOk && !autoOk) setMode("manual");
        else if (!manualOk && autoOk) setMode("auto");
        else if (manualOk && autoOk) setMode((prev) => prev || null);
        else setMode(null);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error?.response?.data?.message || "Failed to load withdraw options",
          );
        }
      } finally {
        if (!cancelled) setLoadingModes(false);
      }
    };

    loadModes();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const bothAvailable = manualAvailable && autoAvailable;

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center px-0 backdrop-blur-[3px] sm:px-4"
          style={{ background: colors.pageOverlayBg }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative flex h-dvh w-full flex-col overflow-hidden shadow-2xl sm:h-[700px] sm:max-w-[375px] sm:rounded-[8px]"
            style={{ backgroundColor: colors.modalBg }}
          >
            <div
              className="relative flex h-[50px] shrink-0 items-center justify-center"
              style={{
                backgroundColor: colors.headerBg,
                color: colors.headerText,
              }}
            >
              <h2 className="text-[18px] font-semibold">{t.title}</h2>

              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center"
                style={{ color: colors.closeIconColor }}
              >
                <X size={24} />
              </button>
            </div>

            <div
              className="flex h-[52px] shrink-0 items-center gap-1 px-4 pb-3"
              style={{ backgroundColor: colors.headerBg }}
            >
              <button
                type="button"
                onClick={onDepositClick}
                className="h-[34px] flex-1 cursor-pointer rounded-[3px] text-[13px] font-bold"
                style={{
                  backgroundColor: colors.inactiveTabBg,
                  color: colors.inactiveTabText,
                }}
              >
                {t.deposit}
              </button>

              <button
                type="button"
                className="h-[34px] flex-1 cursor-pointer rounded-[3px] text-[13px] font-bold"
                style={{
                  backgroundColor: colors.secondaryBg,
                  color: colors.secondaryText,
                }}
              >
                {t.title}
              </button>
            </div>

            {loadingModes ? (
              <div
                className="flex flex-1 items-center justify-center"
                style={{ backgroundColor: colors.modalBg }}
              >
                <div
                  className="flex items-center gap-2 text-[14px] font-semibold"
                  style={{ color: colors.primaryBg }}
                >
                  <Loader2 size={18} className="animate-spin" />
                  {t.loading}
                </div>
              </div>
            ) : !manualAvailable && !autoAvailable ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
                style={{ backgroundColor: colors.modalBg }}
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.dangerBg }}
                >
                  <Ban size={26} style={{ color: colors.dangerText }} />
                </div>
                <p
                  className="text-[15px] font-bold"
                  style={{ color: colors.normalText }}
                >
                  {t.closedTitle}
                </p>
                <p className="text-[12px]" style={{ color: colors.mutedText }}>
                  {t.closedDesc}
                </p>
              </div>
            ) : bothAvailable && mode === null ? (
              <div
                className="flex-1 overflow-y-auto px-4 pb-5 pt-5"
                style={{ backgroundColor: colors.modalBg }}
              >
                <p
                  className="mb-3 text-[14px] font-bold"
                  style={{ color: colors.primaryBg }}
                >
                  {t.chooseMethod}
                </p>

                <button
                  type="button"
                  onClick={() => setMode("auto")}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-[6px] border p-4 text-left transition"
                  style={{
                    backgroundColor: colors.cardBg,
                    borderColor: colors.primaryBg,
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.summaryBg }}
                  >
                    <Zap size={20} style={{ color: colors.primaryBg }} />
                  </div>
                  <div>
                    <p
                      className="text-[14px] font-bold"
                      style={{ color: colors.normalText }}
                    >
                      {t.autoTitle}
                    </p>
                    <p className="text-[11px]" style={{ color: colors.mutedText }}>
                      {t.autoDesc}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-[6px] border p-4 text-left transition"
                  style={{
                    backgroundColor: colors.cardBg,
                    borderColor: colors.cardBorder,
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.sectionBg }}
                  >
                    <WalletIcon size={20} style={{ color: colors.sectionText }} />
                  </div>
                  <div>
                    <p
                      className="text-[14px] font-bold"
                      style={{ color: colors.normalText }}
                    >
                      {t.manualTitle}
                    </p>
                    <p className="text-[11px]" style={{ color: colors.mutedText }}>
                      {t.manualDesc}
                    </p>
                  </div>
                </button>
              </div>
            ) : mode === "auto" ? (
              <AutoWithdrawBody
                open={open}
                colors={colors}
                isBangla={isBangla}
                language={language}
                onClose={onClose}
                onHistoryClick={onHistoryClick}
                showChangeMode={bothAvailable}
                onChangeMode={() => setMode(null)}
              />
            ) : (
              <ManualWithdrawBody
                open={open}
                colors={colors}
                isBangla={isBangla}
                language={language}
                onClose={onClose}
                onHistoryClick={onHistoryClick}
                showChangeMode={bothAvailable}
                onChangeMode={() => setMode(null)}
              />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default WithdrawModal;
