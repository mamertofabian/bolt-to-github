#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="$(node -p "require('./manifest.json').version")"
ARCHIVE="bolt-to-github-v${VERSION}-build.zip"
TEMP_ARCHIVE="${ARCHIVE}.tmp"

cleanup() {
  rm -f "$TEMP_ARCHIVE"
}
trap cleanup EXIT

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid extension version in manifest.json: $VERSION" >&2
  exit 1
fi

# Never allow a failed build to leave an old directory or same-version archive
# that could be mistaken for the current package.
rm -rf dist
rm -f "$ARCHIVE" "$TEMP_ARCHIVE"

# Build the extension
echo "Building extension..."
VITE_GA4_API_SECRET='' pnpm build

# Create zip file
echo "Creating zip file..."
(
  cd dist
  zip -r "../$TEMP_ARCHIVE" .
)
mv "$TEMP_ARCHIVE" "$ARCHIVE"

echo "✅ Build complete: $ARCHIVE"
