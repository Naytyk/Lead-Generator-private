#!/bin/bash
# Build a distributable Chrome extension package.
# Reads the version from manifest.json and produces:
#   dist/unpacked/                          (load-unpacked for dev)
#   dist/SHARE-Lead-Generator-v<version>.zip (upload to Chrome Web Store)
set -e

DIST_DIR="dist"
UNZIPPED_DIR="$DIST_DIR/unpacked"
FILES=("manifest.json" "popup.html" "popup.js" "content.js" "background.js" "results.html" "results.js" "success.html" "success.js")

VERSION=$(grep -o '"version"[^,]*' manifest.json | head -1 | grep -o '[0-9][0-9.]*')
echo "🚀 Building SHARE Lead Generator v$VERSION ..."

rm -rf "$UNZIPPED_DIR"
mkdir -p "$UNZIPPED_DIR"

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$UNZIPPED_DIR/"
    echo "  ✔ $file"
  else
    echo "  ✖ MISSING: $file"; exit 1
  fi
done

ZIP_PATH="$DIST_DIR/SHARE-Lead-Generator-v$VERSION.zip"
rm -f "$ZIP_PATH"
if command -v zip >/dev/null 2>&1; then
  ( cd "$UNZIPPED_DIR" && zip -qr "../../$ZIP_PATH" . )
elif command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Compress-Archive -Path '$UNZIPPED_DIR/*' -DestinationPath '$ZIP_PATH' -Force"
else
  echo "  ⚠ no zip tool found — unpacked build is ready, skipping .zip"
  exit 0
fi

echo "✅ Done."
echo "   Unpacked: $UNZIPPED_DIR  (chrome://extensions → Load unpacked)"
echo "   Package:  $ZIP_PATH"
