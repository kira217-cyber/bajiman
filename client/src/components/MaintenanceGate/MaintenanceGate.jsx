import React, { useEffect, useRef, useState } from "react";
import api from "../../api/axios";

const CACHE_KEY = "maintenance_status_cache_v1";
const POLL_INTERVAL_MS = 15000;

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // private browsing / storage full — fine, cache is best-effort only
  }
};

// Bundled — no network, no image — so this is what shows in the worst
// case (the API is so unreachable that even the uploaded maintenance
// image fails to load).
const MaintenanceFallback = () => (
  <div className="px-6 text-center text-white">
    <p className="text-2xl font-bold">সাইট মেইনটেন্যান্সে আছে</p>
    <p className="mt-2 text-sm text-white/70">
      আমরা শীঘ্রই ফিরে আসছি, একটু পরে আবার চেষ্টা করুন।
    </p>
  </div>
);

const MaintenanceScreen = ({ imageUrl }) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black">
      {imageUrl && !imgFailed ? (
        <img
          src={imageUrl}
          alt="Site under maintenance"
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <MaintenanceFallback />
      )}
    </div>
  );
};

// Gates the whole app behind a full-screen maintenance image when EITHER
// an admin has manually turned maintenance on, OR the API is currently
// erroring (network error / 5xx — flagged by the axios interceptor in
// api/axios.js, which this listens for via window events rather than a
// shared store, so it has zero import-order dependency on anything).
//
// `site` picks which of the two admin-uploaded images to show
// ("client" | "affiliate") — one /api/maintenance/status response
// carries both, since the manual on/off switch is shared across sites.
const MaintenanceGate = ({ site, children }) => {
  const cached = readCache();

  const [manualEnabled, setManualEnabled] = useState(
    cached?.enabled ?? false,
  );
  const [imageUrl, setImageUrl] = useState(cached?.imageUrl || "");
  const [autoTriggered, setAutoTriggered] = useState(false);

  const pollRef = useRef(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data } = await api.get("/api/maintenance/status");
        const payload = data?.data || {};

        const enabled = Boolean(payload.enabled);
        const url =
          site === "affiliate"
            ? payload.affiliateImageUrl
            : payload.clientImageUrl;

        setManualEnabled(enabled);
        setImageUrl(url || "");
        setAutoTriggered(false);

        writeCache({ enabled, imageUrl: url || "" });
      } catch {
        // The axios interceptor's "api-health-error" event already
        // covers this — the last cached enabled/image stays as-is.
      }
    };

    checkStatus();
    pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);

    const handleError = () => setAutoTriggered(true);
    const handleOk = () => setAutoTriggered(false);

    window.addEventListener("api-health-error", handleError);
    window.addEventListener("api-health-ok", handleOk);

    return () => {
      clearInterval(pollRef.current);
      window.removeEventListener("api-health-error", handleError);
      window.removeEventListener("api-health-ok", handleOk);
    };
  }, [site]);

  if (manualEnabled || autoTriggered) {
    return <MaintenanceScreen imageUrl={imageUrl} />;
  }

  return children;
};

export default MaintenanceGate;
