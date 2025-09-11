#!/bin/bash

echo "🔧 Building Reivilo B2B Portal..."

# Clean up
rm -rf dist
mkdir -p dist

# Build client
echo "📦 Building client..."
npm run build:client

# Copy client files from the correct location to public subdirectory
mkdir -p dist/public
if [ -d "client/client/dist" ]; then
  echo "📁 Copying client files from client/client/dist..."
  cp -r client/client/dist/* dist/public/
elif [ -d "client/dist" ]; then
  echo "📁 Copying client files from client/dist..."
  cp -r client/dist/* dist/public/
else
  echo "❌ Client dist directory not found"
  exit 1
fi

# Build server
echo "🖥️ Building server..."
npm run build:server

# Copy attached assets
echo "📂 Copying assets..."
cp -r attached_assets dist/ 2>/dev/null || echo "No attached assets to copy"

# Create 404.html fallback
if [ -f "dist/public/index.html" ]; then
  cp dist/public/index.html dist/public/404.html
fi

echo "✅ Build complete! Files ready in dist/"