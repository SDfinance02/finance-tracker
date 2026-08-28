#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

printf '\n==========================================\n'
printf ' Finance Tracker — publish signed release\n'
printf '==========================================\n\n'

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed. Install it with: brew install gh"
  read -r -p "Press Return to close..." _
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login"
  read -r -p "Press Return to close..." _
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo "Preparing Finance Tracker v${VERSION}..."

git add .
if ! git diff --cached --quiet; then
  git commit -m "Finance Tracker v${VERSION}"
else
  echo "No uncommitted source changes; continuing with current HEAD."
fi

git push origin main

echo "Triggering signed macOS release workflow..."
gh workflow run release-macos.yml
sleep 3
RUN_ID=$(gh run list --workflow release-macos.yml --limit 1 --json databaseId --jq '.[0].databaseId')

echo "GitHub Actions run: ${RUN_ID}"
echo "You can keep this window open to watch the build."
if [ -n "$RUN_ID" ]; then
  gh run watch "$RUN_ID" || true
fi

echo ""
echo "When the workflow is green, Finance Tracker v${VERSION} is published."
echo "An installed older version can then use Settings -> Check for updates."
read -r -p "Press Return to close..." _
