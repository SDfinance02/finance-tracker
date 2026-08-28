#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "=========================================="
echo " Finance Tracker V2.2 - one-time setup"
echo "=========================================="
echo ""

if ! xcode-select -p >/dev/null 2>&1; then
  echo "[MISSING] Apple Command Line Tools"
  echo "Run: xcode-select --install"
  echo "Finish the Apple installer, then run this file again."
  exit 1
fi

echo "[OK] Apple Command Line Tools"

if ! command -v node >/dev/null 2>&1; then
  echo "[MISSING] Node.js"
  echo "Install the current LTS version from https://nodejs.org/"
  echo "Then close/reopen Terminal and run this file again."
  exit 1
fi

echo "[OK] Node $(node --version)"

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then source "$HOME/.cargo/env"; fi
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "[MISSING] Rust / Cargo"
  echo "Official Tauri installation command:"
  echo "curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh"
  echo ""
  echo "After installation, close/reopen Terminal and run this file again."
  exit 1
fi

echo "[OK] $(cargo --version)"
echo ""
echo "Installing/updating JavaScript dependencies..."
npm install

echo ""
echo "Generating native macOS icon assets..."
npm run tauri icon src-tauri/icons/app-icon.png >/dev/null

echo ""
echo "=========================================="
echo " Setup complete"
echo "=========================================="
echo ""
echo "Your finance database lives outside the app bundle and is preserved across app updates."
echo "Next: double-click run_finance.command"
echo ""
read -p "Press Return to close..." _
