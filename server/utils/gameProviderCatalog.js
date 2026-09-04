import axios from "axios";
import GameApiKeySetting from "../models/GameApiKeySetting.js";

// Resolves a real played game's gameUId -> providerCode for turnover
// provider gating (see callbackRoutes.js). The locally-synced Game/
// GameProvider collections only mirror whatever an admin has manually
// curated (hot/featured games) — nowhere near the full live catalog
// (5000+ games) — so a played game's gameUId almost never exists there.
// The live master API's client/game-list DOES cover the full catalog and
// embeds each game's provider.providerCode directly, confirmed against
// real GameHistory.game_uid values. That endpoint is paginated (a few
// thousand games), so the map is cached and refreshed periodically
// instead of hit on every webhook call.
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_LIMIT = 2000;

let cache = { map: new Map(), fetchedAt: 0 };
let inflight = null;

const cleanBaseUrl = (url = "") => String(url || "").trim().replace(/\/+$/, "");

const fetchFullCatalogMap = async () => {
  const setting = await GameApiKeySetting.findOne()
    .sort({ createdAt: -1 })
    .lean();

  if (!setting?.apiKey || !setting.isActive || !setting.isVerified) {
    throw new Error("Game API key not active/verified");
  }

  const baseUrl = cleanBaseUrl(process.env.MASTER_API_URL);
  if (!baseUrl) throw new Error("MASTER_API_URL is missing in .env");

  const map = new Map();
  let page = 1;
  let totalPages = 1;

  do {
    const response = await axios.get(
      `${baseUrl}/api/master/cx-global/client/game-list`,
      {
        timeout: 30000,
        headers: {
          "x-api-key": setting.apiKey,
          "Content-Type": "application/json",
        },
        params: { page, limit: FETCH_LIMIT },
      },
    );

    const data = response?.data?.data || {};
    const games = Array.isArray(data.games) ? data.games : [];

    games.forEach((game) => {
      const uid = String(game?.gameUId || "").trim();
      const code = String(game?.provider?.providerCode || "")
        .trim()
        .toUpperCase();

      if (uid && code) map.set(uid, code);
    });

    totalPages = Number(data?.meta?.totalPages || 1) || 1;
    page += 1;
  } while (page <= totalPages);

  return map;
};

// Stale-while-revalidate: a payment webhook can't afford to block on a
// multi-request catalog fetch, so once a cache exists it's always
// returned immediately (even if past TTL) while a fresh fetch runs in
// the background for next time. Only a true cold start (no cache yet)
// waits on the network.
export const getGameProviderCodeMap = async () => {
  const now = Date.now();
  const hasCache = cache.map.size > 0;
  const isStale = now - cache.fetchedAt >= CACHE_TTL_MS;

  if (hasCache && !isStale) {
    return cache.map;
  }

  if (!inflight) {
    inflight = fetchFullCatalogMap()
      .then((map) => {
        cache = { map, fetchedAt: Date.now() };
        return map;
      })
      .catch(() => cache.map)
      .finally(() => {
        inflight = null;
      });
  }

  if (hasCache) return cache.map;
  return inflight;
};

export const resolveProviderCodeFromCatalog = async (gameUId) => {
  const map = await getGameProviderCodeMap();
  return map.get(String(gameUId || "").trim()) || null;
};
