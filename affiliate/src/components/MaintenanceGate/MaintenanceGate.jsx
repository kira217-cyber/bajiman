import React, { useEffect, useRef, useState } from "react";
import api from "../../api/axios";

const CACHE_KEY = "maintenance_status_cache_v2";
const POLL_INTERVAL_MS = 15000;
const MOBILE_BREAKPOINT = 768;

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

const MaintenanceScreen = ({ desktopUrl, mobileUrl }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const onResize = () =>
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Each breakpoint prefers its own image, but falls back to the other
  // one rather than showing nothing if only one was ever uploaded.
  const imageUrl = (isMobile ? mobileUrl : desktopUrl) || mobileUrl || desktopUrl;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black">
      {imageUrl && !imgFailed ? (
        <img
          src={imageUrl}
          alt="Site under maintenance"
          className="h-full w-full object-contain"
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
// `site` picks which of the two admin-uploaded image pairs to show
// ("client" | "affiliate") — one /api/maintenance/status response
// carries all four, since the manual on/off switch is shared across
// sites. Each pair has a desktop and a mobile image so the full-screen
// image fits whichever shape of screen it lands on.
const MaintenanceGate = ({ site, children }) => {
  const cached = readCache();

  const [manualEnabled, setManualEnabled] = useState(
    cached?.enabled ?? false,
  );
  const [desktopUrl, setDesktopUrl] = useState(cached?.desktopUrl || "");
  const [mobileUrl, setMobileUrl] = useState(cached?.mobileUrl || "");
  const [autoTriggered, setAutoTriggered] = useState(false);

  const pollRef = useRef(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const { data } = await api.get("/api/maintenance/status");
        const payload = data?.data || {};

        const enabled = Boolean(payload.enabled);
        const desktop =
          site === "affiliate"
            ? payload.affiliateImageDesktopUrl
            : payload.clientImageDesktopUrl;
        const mobile =
          site === "affiliate"
            ? payload.affiliateImageMobileUrl
            : payload.clientImageMobileUrl;

        setManualEnabled(enabled);
        setDesktopUrl(desktop || "");
        setMobileUrl(mobile || "");
        setAutoTriggered(false);

        writeCache({
          enabled,
          desktopUrl: desktop || "",
          mobileUrl: mobile || "",
        });
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
    return <MaintenanceScreen desktopUrl={desktopUrl} mobileUrl={mobileUrl} />;
  }

  return children;
};

export default MaintenanceGate;
