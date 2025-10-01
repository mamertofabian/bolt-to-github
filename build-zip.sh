#!/bin/bash

# Build the extension
echo "Building extension..."
pnpm build

# Get version from manifest.json
VERSION=$(node -p "require('./manifest.json').version")

# Create zip file
echo "Creating zip file..."
cd dist && zip -r ../bolt-to-github-v${VERSION}-build.zip . && cd ..

echo "✅ Build complete: bolt-to-github-v${VERSION}-build.zip"
