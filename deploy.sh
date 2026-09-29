#!/bin/bash
# Zivvvo Web App — Production Deploy Script
# Run this ON the server (161.97.115.59) after pulling the latest code

set -e

echo "=== Zivvvo Web App Deploy ==="

# 1. Pull latest code
cd /var/www/zivvvo
git pull origin main

# 2. Install dependencies (if package.json changed)
npm install --no-audit --no-fund

# 3. Build web app
cd apps/web
npx vite build

# 4. Generate service worker
node ../../tools/zivvvo/build-precache.mjs

# 5. Copy images (if not already present)
node ../../tools/zivvvo/copy-images.mjs

# 6. Set permissions
chmod -R 755 dist/

# 7. Verify critical files exist
echo "Verifying build..."
test -f dist/index.html && echo "  ✓ index.html"
test -f dist/sw.js && echo "  ✓ sw.js"
test -f dist/manifest.webmanifest && echo "  ✓ manifest.webmanifest"
test -f dist/sitemap.xml && echo "  ✓ sitemap.xml"
test -f dist/tos.html && echo "  ✓ tos.html"
test -f dist/privacy.html && echo "  ✓ privacy.html"
test -f dist/.well-known/assetlinks.json && echo "  ✓ assetlinks.json"

# 8. Show bundle sizes
echo ""
echo "Bundle sizes:"
ls -lh dist/assets/*.js | awk '{print "  " $9 ": " $5}'

echo ""
echo "=== Deploy complete ==="
echo "Visit: https://www.zivvvo.co.zw"
