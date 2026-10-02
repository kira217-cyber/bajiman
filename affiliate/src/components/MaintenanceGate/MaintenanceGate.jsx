import React, { useEffect, useRef, useState } from "react";
import { Wrench, RotateCw } from "lucide-react";
import api from "../../api/axios";
import bajimanLogo from "../../assets/maintenance-logo.png";

const CACHE_KEY = "maintenance_status_cache_v2";
const POLL_INTERVAL_MS = 15000;
const MOBILE_BREAKPOINT = 768;
const BRAND_RED = "#ff1616";

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

// Bajiman-branded fallback — shown whenever there's no admin-uploaded
// image to display (auto-detected outage, or the image itself failed to
// load). Logo is bundled (not fetched from the API), since this screen's
// whole job is to still render while the API is unreachable.
const MaintenanceFallback = () => (
  <div className="flex flex-col items-center px-6 text-center">
    <img
      src={bajimanLogo}
      alt="Bajiman"
      className="h-14 w-auto object-contain sm:h-16"
      draggable={false}
    />

    <div
      className="mt-8 flex h-16 w-16 items-center justify-center rounded-full"
      style={{
        backgroundColor: "rgba(255, 22, 22, 0.12)",
        boxShadow: `0 0 0 1px rgba(255, 22, 22, 0.35)`,
      }}
    >
      <Wrench size={26} style={{ color: BRAND_RED }} />
    </div>

    <p className="mt-6 text-2xl font-bold text-white">
      সাইট মেইনটেন্যান্সে আছে
    </p>
    <p className="mt-2 max-w-sm text-sm leading-6 text-white/65">
      আমরা শীঘ্রই ফিরে আসছি, একটু পরে আবার চেষ্টা করুন।
    </p>

    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-8 inline-flex cursor-pointer items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
      style={{ backgroundColor: BRAND_RED }}
    >
      <RotateCw size={15} />
      আবার চেষ্টা করুন
    </button>
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

// A render crash anywhere below this (very likely during a real API
// outage — most components aren't null-safe against failed fetches)
// used to take down the whole React tree with nothing to catch it,
// silently skipping the maintenance screen entirely. This boundary
// catches that and falls back to the same branded screen.
class MaintenanceErrorBoundary extends React.Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error) {
    console.error("MaintenanceGate caught a render crash:", error);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black">
          <MaintenanceFallback />
        </div>
      );
    }

    return this.props.children;
  }
}

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

  return (
    <MaintenanceErrorBoundary>{children}</MaintenanceErrorBoundary>
  );
};

export default MaintenanceGate;
