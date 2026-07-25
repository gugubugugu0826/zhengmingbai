# 整明白 · 微信小程序（一期骨架）

「整明白」AI 整理收纳助手的微信小程序端最小骨架。
**方案：微信原生小程序**（非 Taro），原因与迁移说明见文末。

## 功能范围（一期）

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 登录页 | `pages/login/login` | 手机号 + 验证码 Mock 登录，调 `POST /auth/login`，任意 4 位数字验证码即过，token 存 storage |
| 首页 | `pages/home/home` | 问候语 + 「开始整理」大按钮 + 空间列表（调 `GET /spaces`，接口未就绪时优雅降级为占位文案） |
| webview 占位页 | `pages/webview/webview` | 说明「完整流程请在 H5 体验」，预留 `web-view` 组件（复用 H5，二期小程序原生实现） |

其余页面（拍照、AI 识别、入柜等）一期复用 H5 或二期开发。

## 一、如何用微信开发者工具打开

1. 打开**微信开发者工具** → 导入项目 → 选择本目录 `zhengmingbai/miniprogram/`
   - `project.config.json` 已配置 `appid: touristappid`（测试号），无需自己的 AppID 即可导入
2. 导入后：**详情 → 本地设置 → 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**
   - 因为后端是 `http://localhost:3001`，开发期必须跳过域名校验
3. 点击「编译」，进入登录页：
   - 输入任意 **11 位手机号** + 任意 **4 位数字验证码** → 登录成功进入首页
4. 首页点击「开始整理」→ 进入 webview 占位页（说明文案）

> 前提：后端已在本机启动（`http://localhost:3001/api/v1`，见 `zhengmingbai/server/`）。
> localhost 指开发者电脑自身，请确保后端与开发者工具在同一台机器上运行。

## 二、真机预览注意

- 真机**无法**使用 `localhost` / `http` 请求，必须：
  1. 将后端部署到 **https 域名**，修改 `utils/config.js` 的 `API_BASE`；
  2. 在小程序管理后台「开发 → 开发管理 → 服务器域名」把该域名加入 **request 合法域名**白名单。
- `web-view` 嵌入 H5 还需把 H5 域名配置为**业务域名**，然后把 `pages/webview/webview.js` 中 `webviewEnabled` 置为 `true`。

## 三、目录结构

```
miniprogram/
├── project.config.json      # 测试号 appid，compileType: miniprogram
├── sitemap.json
├── app.js / app.json / app.wxss   # 全局登录态管理 + 暖米白主题
├── pages/
│   ├── login/               # Mock 登录
│   ├── home/                # 问候 + 开始整理 + 空间列表占位
│   └── webview/             # H5 承载占位页
└── utils/
    ├── config.js            # API_BASE / H5_BASE
    └── request.js           # wx.request 封装：Bearer token、{code:0,data} 解包、401 跳登录
```

## 四、设计约定

- UI 与 web 端一致：暖米白 `#FAF6F0` 底、橘棕 `#C08A5E` 主色、圆角 16px（32rpx）
- 后端统一响应 `{ code: 0, data, message }`，由 `utils/request.js` 统一解包
- token 持久化在 `wx.storage`，`app.js` 的 `setSession/clearSession` 统一管理

## 五、二期 Taro 迁移说明

一期采用**微信原生**而非 Taro 3 的原因：
- Taro 构建链（Webpack/Vite + 编译时）依赖重，骨架阶段微信原生**零安装、打开即跑**，更稳；
- 一期仅 3 个页面、业务逻辑极少，迁移成本低。

二期若要迁移到 Taro 3 + React（与 web 端共享 `packages/shared` 类型）：
1. 在仓库根 `packages/` 下新建 `packages/miniprogram-taro`，`taro init` 选 React + TS 模板；
2. 把本目录 3 个页面的 `.wxml/.wxss` 改写为 JSX + CSS Modules，逻辑几乎平移；
3. `utils/request.js` 替换为 `Taro.request` 封装，接口签名保持不变；
4. 共享类型直接从 `packages/shared` 引入。
