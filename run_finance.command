#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Finance Tracker is not installed yet."
  echo "Run install.command first."
  read -p "Press Return to close..." _
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then source "$HOME/.cargo/env"; fi
fi

if [ ! -f "src-tauri/icons/icon.icns" ]; then
  echo "Preparing app icon assets..."
  npm run tauri icon src-tauri/icons/app-icon.png >/dev/null
fi

echo "Starting Finance Tracker V2.4..."
echo "Keep this Terminal window open while using development mode."
echo "Press Control+C here to stop the app."
echo ""
npm run tauri:dev
