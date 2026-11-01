import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import api from "../../api/axios";
import { useLanguage } from "../../Context/LanguageProvider";
import { updateUser } from "../../features/auth/authSlice";
import { selectIsAuth } from "../../features/auth/authSelectors";

/*
 * Back from the MFSWallet payment page (?mfs=<invoice>&result=...).
 *
 * The `result` in the URL is only what the gateway page redirected with, so
 * the real state is asked from the server; the balance is refreshed when the
 * deposit is already paid. The query is removed afterwards so a page reload
 * does not show it again.
 */
const MfsReturnNotice = () => {
  const { isBangla } = useLanguage();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuth);
  const [params, setParams] = useSearchParams();

  const invoice = params.get("mfs") || "";

  useEffect(() => {
    if (!invoice || !isAuthenticated) return;

    let alive = true;

    const clear = () => {
      const next = new URLSearchParams(params);
      next.delete("mfs");
      next.delete("result");
      setParams(next, { replace: true });
    };

    const check = async () => {
      try {
        const { data } = await api.get(`/api/mfs-deposit/my/${encodeURIComponent(invoice)}`);
        const deposit = data?.data?.deposit || {};
        if (!alive) return;

        if (deposit.status === "PAID") {
          const amount = Number(deposit?.calc?.creditedAmount || deposit.amount || 0);

          toast.success(
            isBangla
              ? `ডিপোজিট সফল — ৳ ${amount.toLocaleString("en-US")} ব্যালেন্সে যোগ হয়েছে`
              : `Deposit successful — ৳ ${amount.toLocaleString("en-US")} added to your balance`,
          );

          const res = await api.get("/api/user-info/balance");
          const bal = res?.data?.data || {};
          dispatch(
            updateUser({
              balance: Number(bal.balance || 0),
              currency: bal.currency || "BDT",
            }),
          );
        } else if (deposit.status === "FAILED") {
          toast.error(
            isBangla
              ? "ডিপোজিট সফল হয়নি। টাকা কেটে থাকলে সাপোর্টে যোগাযোগ করুন।"
              : "The deposit did not go through. If money was taken, please contact support.",
          );
        } else {
          toast.info(
            isBangla
              ? "ডিপোজিট যাচাই হচ্ছে — নিশ্চিত হলেই ব্যালেন্সে যোগ হবে।"
              : "Your deposit is being verified — it will be added once confirmed.",
          );
        }
      } catch {
        // Unknown invoice (or not this user's) — nothing to show
      } finally {
        if (alive) clear();
      }
    };

    check();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, isAuthenticated]);

  return null;
};

export default MfsReturnNotice;
