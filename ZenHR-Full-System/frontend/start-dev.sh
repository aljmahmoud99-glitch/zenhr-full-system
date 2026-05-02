#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# Replit dev-server startup wrapper
#
# Problem: Replit maps localPort=4200 → externalPort=80 (the default "new tab"
# URL). Angular runs on port 5000 (required for the webview Preview pane).
# So visiting the app in a new browser tab hits port 4200 — nothing there.
#
# Fix: start a transparent TCP proxy on port 4200 that forwards all traffic
# (HTTP + WebSocket/HMR) to Angular on port 5000.
# ---------------------------------------------------------------------------

# 1. Safety patch: force Vite to accept any Host header (Replit proxy changes
#    the Host from localhost to the external domain).
OPTS_FILE="node_modules/@angular/build/src/builders/dev-server/options.js"
if [ -f "$OPTS_FILE" ]; then
  if grep -q "allowedHosts: allowedHosts ? allowedHosts : \[\]" "$OPTS_FILE" 2>/dev/null; then
    sed -i 's/allowedHosts: allowedHosts ? allowedHosts : \[\]/allowedHosts: true/g' "$OPTS_FILE"
    echo "[start-dev] Patched allowedHosts in @angular/build dev-server options"
  fi
  if grep -q "allowedHosts: allowedHosts," "$OPTS_FILE" 2>/dev/null; then
    sed -i 's/allowedHosts: allowedHosts,/allowedHosts: true,/g' "$OPTS_FILE"
    echo "[start-dev] Patched allowedHosts (variant) in @angular/build dev-server options"
  fi
fi

# 2. Start TCP proxy: port 4200 (Replit externalPort=80, the new-tab URL)
#    → port 5000 (Angular / Vite).  Handles HTTP and WebSocket transparently.
node scripts/tcp-proxy.js 4200 5000 &
TCP_PROXY_PID=$!
echo "[start-dev] TCP proxy started (pid $TCP_PROXY_PID): 0.0.0.0:4200 → localhost:5000"

# Ensure proxy is killed when this script exits
trap "kill $TCP_PROXY_PID 2>/dev/null || true" EXIT INT TERM

# 3. Start Angular dev server (Vite) on port 5000.
exec node_modules/.bin/ng serve --configuration=development
