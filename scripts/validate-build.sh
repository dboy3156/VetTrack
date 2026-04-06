#!/usr/bin/env bash
set -euo pipefail

echo "🔨 Running Vite frontend build..."

npx vite build

DIST_DIR="dist/public"

if [ ! -d "$DIST_DIR" ]; then
  echo "❌ Build failed: dist/public directory does not exist."
  exit 1
fi

FILE_COUNT=$(find "$DIST_DIR" -type f | wc -l)

if [ "$FILE_COUNT" -lt 1 ]; then
  echo "❌ Build failed: dist/public is empty."
  exit 1
fi

echo "✅ Frontend build passed — $FILE_COUNT file(s) in $DIST_DIR."
