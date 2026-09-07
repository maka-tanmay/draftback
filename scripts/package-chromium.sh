#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT/manifest.json').version")
ARCHIVE="$ROOT/dist/draftback-chromium-$VERSION.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$ROOT/dist" "$STAGE/DraftBack"
for file in manifest.json background.js content.js recovery-core.js recovery.js crypto.js store-runtime.js shared.js popup.html popup.js settings.html settings.js onboarding.html onboarding.js privacy.html ui.css autofill.js autofill-page.js profile.html profile.js INSTALL.md PRIVACY.md LICENSE; do
  cp "$ROOT/$file" "$STAGE/DraftBack/$file"
done
cp -R "$ROOT/icons" "$STAGE/DraftBack/icons"

rm -f "$ARCHIVE"
(cd "$STAGE/DraftBack" && zip -q -r "$ARCHIVE" .)
echo "$ARCHIVE"
