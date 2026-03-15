#!/bin/bash
PROJECT_NAME="Lead-Generator-v2"
DIST_DIR="dist"
UNZIPPED_DIR="$DIST_DIR/unpacked_extension"

echo "🚀 Building Robust Version..."
mkdir -p "$UNZIPPED_DIR"
rm -rf "$UNZIPPED_DIR"/*

FILES=("manifest.json" "popup.html" "popup.js" "content.js" "background.js" "results.html" "results.js" "16.png")

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$UNZIPPED_DIR/"
        echo "  ✔️ Copied $file"
    fi
done

echo "✅ Done! Refresh your extension in Chrome."