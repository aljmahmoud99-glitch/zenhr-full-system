#!/bin/bash
set -e

cd /home/runner/workspace/ZenHR-Full-System

echo "Starting ZenJO API server..."
/home/runner/workspace/ZenHR-Full-System/artifacts/api-server/node_modules/.bin/tsx artifacts/api-server/src/index.ts &
API_PID=$!

echo "Starting Angular frontend on port 5000..."
cd /home/runner/workspace/ZenHR-Full-System/frontend
node_modules/.bin/ng serve --configuration=development 2>&1

# Cleanup
kill $API_PID 2>/dev/null || true
