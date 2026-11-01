import { useEffect, useSyncExternalStore } from "react";
import { api } from "../../api/axios";

// Requests waiting for an admin — /api/dashboard/pending, keyed by the
// sidebar menu key. The sidebar, the top bar bell and the dashboard read the
// same store; it refreshes every 30 seconds and when the tab is shown again.
let state = { counts: {}, total: 0 };
const listeners = new Set();
let timer = null;
let users = 0;

const emit = () => listeners.forEach((fn) => fn());

export const refreshPending = async () => {
  try {
    const { data } = await api.get("/api/dashboard/pending");
    state = {
      counts: data?.data?.counts || {},
      total: Number(data?.data?.total || 0),
    };
    emit();
  } catch {
    // logged out or offline — keep the last numbers
  }
};

const onVisible = () => {
  if (document.visibilityState === "visible") refreshPending();
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const usePending = () => {
  const value = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    users += 1;

    if (!timer) {
      refreshPending();
      timer = setInterval(refreshPending, 30000);
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      users -= 1;

      if (users <= 0 && timer) {
        clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, []);

  return value;
};

// What each pending key means — shared by the bell list and the dashboard
export const PENDING_ITEMS = [
  { key: "deposit-requests", to: "/deposit-requests", label: "Deposit Requests" },
  { key: "auto-deposit-history", to: "/auto-deposit-history", label: "Auto Deposit (to confirm)" },
  { key: "mfs-deposit-history", to: "/mfs-deposit-history", label: "Personal Deposit (needs review)" },
  { key: "withdraw-requests", to: "/withdraw-requests", label: "Withdraw Requests" },
  { key: "auto-withdraw-history", to: "/auto-withdraw-history", label: "Auto Withdraw (to approve)" },
  { key: "aff-withdraw-requests", to: "/aff-withdraw-requests", label: "Affiliate Withdraw Requests" },
  { key: "all-affiliate-users", to: "/all-affiliate-users", label: "New Affiliates (to approve)" },
];
