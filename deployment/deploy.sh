#!/bin/bash
# SMT Portal VPS Deployment Script

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting Deployment Process..."

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# 1. Pull latest code (including pre-built frontend/dist) from GitHub
echo "📥 Pulling latest code from main branch..."
git fetch origin main
git reset --hard origin/main

# 2. Restart backend server via PM2
echo "🔄 Starting/Reloading Backend PM2 process..."
pm2 restart all || pm2 startOrReload deployment/pm2.config.json

# 3. Save PM2 configuration to restart automatically on VPS reboot
echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ Deployment finished successfully with zero CPU spike!"
