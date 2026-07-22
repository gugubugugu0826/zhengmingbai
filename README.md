# 整明白（zhengmingbai）

AI 整理收纳助手 —— 拍张照片，AI 帮你把家"整明白"。

一套代码三端：**微信小程序 + 响应式 H5 + Node.js 后端**。

## 功能概览

- 📸 **拍照整理**：上传房间照片，AI（视觉大模型）识别物品并生成整理方案
- 🤖 **AI 方案编排**：qwen-vl-plus 视觉分析 + qwen-plus 方案生成 + 文生图效果预览
- 🗂️ **我的空间**：多空间管理（客厅/卧室/厨房/仓库…），方案版本管理与重生成
- 🪙 **点数体系**：新用户赠点、AI 分析/文生图扣点、点数流水
- 👤 **账号体系**：邮箱+验证码 / 邮箱+密码 / 手机+密码三种登录，图形验证码防刷
- 🛠️ **管理后台**：/admin 双因子登录（邮箱验证码 → 管理员密码），用户/点数/知识库/开关管理，老用户迁移

## 技术栈

| 端 | 技术 |
|----|------|
| 后端 `server/` | Node.js + Express + better-sqlite3（`node:sqlite`）+ JWT + svg-captcha |
| H5 `web/` | Vite + React + Tailwind CSS |
| 小程序 `miniprogram/` | 原生微信小程序（webview 承载 H5） |
| 共享 `packages/shared` | TypeScript 类型与 API client |
| AI | 阿里云百炼 qwen-vl-plus / qwen-plus / 文生图 |
| 存储 | 腾讯云 COS |
| 邮件 | 腾讯云 SES |

## 目录结构

```
zhengmingbai/
├── server/          # 后端服务（Express + SQLite）
│   └── src/
│       ├── modules/ # auth / spaces / plans / ai / points / admin / account ...
│       ├── migrations/
│       └── middleware/
├── web/             # 响应式 H5（Vite + React）
│   └── src/
│       ├── pages/   # Login / Register / Account / Spaces / Plan ...
│       └── admin/   # 管理后台
├── miniprogram/     # 微信小程序壳
└── packages/shared/ # 共享类型与 API client
```

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量（参考 server/.env.example）
cp server/.env.example server/.env

# 启动后端（端口 3001）
npm run dev --workspace=server

# 启动 H5（Vite dev server）
npm run dev --workspace=web
```

## 测试

```bash
# 后端冒烟测试（新注册登录链路，32 项）
cd server && node smoke.mjs
```

## 版本

- **v2.2.0**（当前）：账号体系重做（三方式登录 + 图形验证码 + /admin 双因子 + 老用户迁移）+ 9 项遗留 Bug 修复
- v2.1：管理员后台 + 文生图 + 双因子登录
- v2.0：AI 真实接入 + COS 云存储

---

> 本项目为私有创业项目，仓库仅供 owner 与协作方参考。生产环境：https://zhengmingbai.cn
