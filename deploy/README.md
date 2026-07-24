# deploy/ — 生产部署归档（v3.1 T03）

> 2026-07-24 自生产机（ubuntu@159.75.155.11）取回归档。配置变更以本目录为准入库，避免"现网手改无人知"。

## 文件清单

| 文件 | 现网位置 | 说明 |
|---|---|---|
| `nginx.conf` | `/etc/nginx/sites-available/zhengmingbai`（软链 sites-enabled） | 站点配置：HTTPS(Certbot) + `/api/` 反代 127.0.0.1:3001 + SPA 兜底 |
| `zmb-server.service` | `/etc/systemd/system/zmb-server.service` | 后端 systemd 单元：tsx 直跑、Restart=always、MemoryMax=1200M |
| `deploy.sh` | —（本机执行） | 一键部署：构建 web → rsync server/web-dist → 远端 npm ci → systemctl restart → 探活 |

## 生产拓扑

```
公网 443 ── nginx (zhengmingbai.cn / www.zhengmingbai.cn)
              ├─ /            → /opt/zhengmingbai/web-dist (SPA, try_files index.html)
              ├─ /api/        → http://127.0.0.1:3001 (Express + node:sqlite)
              └─ /health      → http://127.0.0.1:3001
systemd zmb-server.service → /opt/zhengmingbai/server (tsx src/index.ts, NODE_ENV=production)
数据：/opt/zhengmingbai/server/data/zhengmingbai.db（WAL）
上传：/opt/zhengmingbai/server/uploads/
```

## 密钥与脱敏说明

- nginx 配置**不含**任何明文密钥（证书路径为 Let's Encrypt 标准路径，公开无敏感）
- 后端全部密钥（JWT_SECRET / COS / SES / 微信支付 / WECHAT_MSG_TOKEN 等）只存在于生产机 `/opt/zhengmingbai/server/.env`，**不入库、不在本目录**
- `.env` 模板见仓库根 `.env.example`

## 变更流程

1. 本目录改配置 → 2. scp 覆盖现网 → 3. `nginx -t && systemctl reload nginx`（或 `daemon-reload && restart zmb-server`）→ 4. 探活验证
