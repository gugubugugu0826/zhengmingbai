#!/usr/bin/env bash
# 「整明白」生产部署脚本（v3.1 T03 归档）
# 用法：在仓库根目录执行  bash deploy/deploy.sh
# 前提：本机已配置到生产机（ubuntu@159.75.155.11）的 SSH 免密/交互登录
set -euo pipefail

SERVER_HOST="ubuntu@159.75.155.11"
REMOTE_DIR="/opt/zhengmingbai"

echo "==> 1/5 本地构建 web"
npm run build --workspace=web

echo "==> 2/5 同步 server 源码到生产机（不含 node_modules / data / uploads / .env）"
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude 'uploads' \
  --exclude '.env' \
  server/ "${SERVER_HOST}:${REMOTE_DIR}/server/"

echo "==> 3/5 同步 web 构建产物"
rsync -avz --delete web/dist/ "${SERVER_HOST}:${REMOTE_DIR}/web-dist/"

echo "==> 4/5 生产机安装依赖"
ssh "${SERVER_HOST}" "cd ${REMOTE_DIR}/server && npm ci --omit=dev"

echo "==> 5/5 重启服务并探活"
ssh "${SERVER_HOST}" "sudo systemctl restart zmb-server && sleep 2 && curl -sf http://127.0.0.1:3001/health"

echo "==> 部署完成 ✅  https://zhengmingbai.cn/health"
