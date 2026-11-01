#!/usr/bin/env bash
# Builds Bajiman/Deploy for the VPS — run from the Bajiman folder:  bash ops/build-deploy.sh
#
# Deploy/ is git-ignored (api/.env holds the database password).
# api/.env = server/.env.production (the VPS values, also git-ignored).
# The live URLs are passed here explicitly, so the build never depends on the
# local .env.local files (those switch between local and online by comments).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f server/.env.production ] || { echo "server/.env.production is missing"; exit 1; }

API=https://api.bajiman.com
CLIENT=https://bajiman.com
AFFILIATE=https://m-affiliate.bajiman.com
BRAND=https://brand.bajiman.com
GUIDE=https://guide.bajiman.com
# the admin's Oracle game-data key comes from the (git-ignored) VPS env
ORACLE_KEY=$(grep -E '^ORACLE_GAME_DATA_KEY=' server/.env.production | cut -d= -f2- | tr -d '"\r')
[ -n "$ORACLE_KEY" ] || { echo "ORACLE_GAME_DATA_KEY is missing in server/.env.production"; exit 1; }

build() {
  local app="$1" out="$2"
  shift 2
  echo "--- $app -> Deploy/$out"
  (cd "$app" && [ -d node_modules ] || (cd "$app" && npm ci))
  (cd "$app" && env "$@" npx vite build --outDir "../Deploy/$out" --emptyOutDir --logLevel warn)
  if grep -rqs "localhost:5000" "Deploy/$out"; then
    echo "Deploy/$out still points to localhost:5000" >&2
    exit 1
  fi
}

rm -rf Deploy && mkdir -p Deploy/api/uploads

build client client VITE_API_URL=$API VITE_AFFILIATE_URL=$AFFILIATE VITE_CLIENT_URL=$CLIENT VITE_BRAND_URL=$BRAND VITE_GUIDE_URL=$GUIDE
build affiliate affiliate VITE_API_URL=$API VITE_CLIENT_URL=$CLIENT
build admin admin VITE_API_URL=$API VITE_ORACLE_GAME_DATA_KEY=$ORACLE_KEY
build Brand brand VITE_CLIENT_URL=$CLIENT
build Guide guide VITE_API_URL=$API VITE_CLIENT_URL=$CLIENT VITE_AFFILIATE_URL=$AFFILIATE VITE_BRAND_URL=$BRAND

# server — code only; uploads only the default 9 Wicket image (the live
# uploads folder holds the admin's pictures and must never be replaced)
(cd server && tar --exclude=node_modules --exclude=".env" --exclude=".env.*" --exclude="*.log" --exclude="uploads" -cf - .) | (cd Deploy/api && tar -xf -)
cp server/uploads/nine-wicket.png Deploy/api/uploads/
cp server/.env.production Deploy/api/.env

cp ops/DEPLOY.md Deploy/README.md
echo "Deploy/ ready"
