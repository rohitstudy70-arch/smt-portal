#!/bin/bash
# SMT Portal VPS Deployment Script

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Starting Deployment Process..."

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# 1. Pull latest code from GitHub
echo "📥 Pulling latest code from main branch..."
git pull origin main

# 2. Setup backend dependencies
echo "⚙️ Installing backend dependencies..."
cd backend
npm install --production
cd ..

# 3. Setup frontend dependencies and build
echo "📦 Installing frontend dependencies & building..."
cd frontend
npm install
npm run build
cd ..

# 4. Restart backend server via PM2
echo "🔄 Starting/Reloading Backend PM2 process..."
pm2 startOrReload deployment/pm2.config.json

# 5. Save PM2 configuration to restart automatically on VPS reboot
echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ Deployment finished successfully!"
