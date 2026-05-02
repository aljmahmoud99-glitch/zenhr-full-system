#!/usr/bin/env bash
set -e

# Ensure @angular/build dev-server passes allowedHosts: true to Vite.
# This is required for Replit's proxied environment where the Host header
# differs from localhost. The @angular/build:dev-server schema accepts
# allowedHosts: true, but as a safety net we also patch the compiled JS.

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

exec node_modules/.bin/ng serve --configuration=development
