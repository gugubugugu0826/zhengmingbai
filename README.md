# 整明白（zhengmingbai）

AI 整理收纳助手 —— 拍张照片，AI 帮你把家"整明白"。

一套代码三端：**微信小程序 + 响应式 H5（桌面/平板/手机三档）+ Node.js 后端**。

## 功能概览

- 📸 **拍照整理**：上传房间照片，AI（视觉大模型）识别物品并生成整理方案
- 🤖 **AI 方案编排**：qwen-vl-plus 视觉分析 + qwen-plus 方案生成 + 文生图效果预览
- 🗂️ **我的空间**：多空间管理（10 种类型），方案版本管理与重生成，实时状态机（待执行/执行中/已完成）
- 🖥️ **三端响应式**：桌面左侧 6 导航 / 平板折叠抽屉 / 手机底部 3 Tab，设计 tokens 驱动
- 👤 **账号体系**：邮箱验证码 / 密码登录（邮箱或手机号）两 Tab，忘记密码、更改邮箱自助闭环，图形验证码弹窗防刷
- 🔔 **30 天复查提醒**：采纳方案自动建提醒，到期站内消息，账号页开关可控
- 🖼️ **整理前后对比**：执行清单收尾拍照存档，空间详情并排展示整理前 vs 整理后
- 🪙 **点数体系**：新用户赠点、AI 分析扣点、三档套餐（体验/家庭⭐/囤货），商城支付挂起
- 🛠️ **管理后台**：/admin 双因子登录，用户/点数/知识库/开关管理，老用户迁移，注册开关 + 维护模式

## 技术栈

| 端 | 技术 |
|----|------|
| 后端 `server/` | Node.js + Express + SQLite（`node:sqlite`）+ JWT + svg-captcha |
| H5 `web/` | Vite + React + Tailwind CSS（自定义三档断点 375/768/1280 + 设计 tokens） |
| 小程序 `miniprogram/` | 原生微信小程序（10 页全量，能力对齐 Web） |
| 共享 `packages/shared` | TypeScript 类型与 API client |
| AI | 阿里云百炼 qwen-vl-plus / qwen-plus / 文生图 |
| 存储 | 腾讯云 COS |
| 邮件 | 腾讯云 SES（注册/登录/忘记密码/更改邮箱/迁移通知多模板） |

## 目录结构

```
zhengmingbai/
├── server/          # 后端服务（Express + SQLite）
│   └── src/
│       ├── modules/ # auth / spaces / plans / ai / points / admin / account / sessions / reminder ...
│       ├── migrations/
│       └── middleware/  # auth / maintenance / rateLimit ...
├── web/             # 响应式 H5（Vite + React）
│   └── src/
│       ├── pages/   # Login / Register / ForgotPassword / Home / Account / Store / SpaceDetail ...
│       ├── components/ # AppShell / SideNav / CaptchaDialog / MaintenancePage ...
│       └── admin/   # 管理后台
├── miniprogram/     # 微信小程序（10 页全量）
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

# 小程序：微信开发者工具打开 miniprogram/，勾"不校验合法域名"
```

## 测试

```bash
# 后端冒烟测试（注册登录链路，32 项）
cd server && node smoke.mjs

# v3 端到端（忘记密码/更改邮箱/商城/前后对比，25 项）
cd server && node qa-t03-e2e.mjs
```

## 版本

- **v3.0.0**（当前）：前端三端改造（Web 桌面化 22 页 + 小程序 10 页）+ 账号增强（忘记密码/更改邮箱/验证码弹窗）+ 新功能（30 天复查提醒/前后对比/商城/注册开关/维护模式）
- v2.2.0：账号体系重做（三方式登录 + 图形验证码 + /admin 双因子 + 老用户迁移）+ 9 项遗留 Bug 修复
- v2.1：管理员后台 + 文生图 + 双因子登录
- v2.0：AI 真实接入 + COS 云存储

---

> 本项目为私有创业项目，仓库仅供 owner 与协作方参考。生产环境：https://zhengmingbai.cn
