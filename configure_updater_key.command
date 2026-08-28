#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Run install.command first."
  read -p "Press Return to close..." _
  exit 1
fi

KEY_DIR="$HOME/.finance-tracker"
KEY_PATH="$KEY_DIR/updater.key"
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [ -f "$KEY_PATH" ]; then
  echo "A Finance Tracker updater private key already exists at:"
  echo "$KEY_PATH"
  echo ""
  echo "Do NOT overwrite it unless you intentionally rotate keys."
  if [ -f "$KEY_PATH.pub" ]; then
    echo "Public key: $KEY_PATH.pub"
    pbcopy < "$KEY_PATH.pub"
    echo "The PUBLIC key was copied to your clipboard."
  fi
  read -p "Press Return to close..." _
  exit 0
fi

echo "Finance Tracker will now generate the signing key pair used for future updates."
echo "The PRIVATE key stays on this Mac at: $KEY_PATH"
echo "Keep it safe and backed up. Never paste it into Finance Tracker itself."
echo ""
echo "Tauri may ask you to choose a password for the private key."
echo ""
npm run tauri signer generate -- -w "$KEY_PATH"
chmod 600 "$KEY_PATH" 2>/dev/null || true

if [ -f "$KEY_PATH.pub" ]; then
  pbcopy < "$KEY_PATH.pub"
  echo ""
  echo "[OK] Public key generated and copied to your clipboard."
  echo "Public key file: $KEY_PATH.pub"
else
  echo ""
  echo "Key pair generated. Follow the Tauri output above to copy the public key."
fi

echo ""
echo "Next: follow UPDATER_SETUP.md to add the private key to GitHub Actions and configure the release channel."
read -p "Press Return to close..." _
