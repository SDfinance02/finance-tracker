#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Run install.command first."
  read -p "Press Return to close..." _
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then source "$HOME/.cargo/env"; fi
fi

echo "Preparing native app icon assets..."
npm run tauri icon src-tauri/icons/app-icon.png >/dev/null

echo "Building Finance Tracker as a standalone macOS application..."
echo "Your SQLite data is NOT embedded in the .app and will remain untouched."
echo "This can take several minutes."
npm run tauri:build

echo ""
APP_PATH=$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name "*.app" -print -quit 2>/dev/null || true)
if [ -n "$APP_PATH" ]; then
  echo "Build complete: $APP_PATH"
  echo "Opening the folder in Finder..."
  open "$(dirname "$APP_PATH")"
else
  echo "Build finished. Check src-tauri/target/release/bundle/ for the generated app."
fi
read -p "Press Return to close..." _
