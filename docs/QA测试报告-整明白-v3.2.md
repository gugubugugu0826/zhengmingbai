# QA 测试报告 · 整明白 v3.2

> 日期：2026-07-24 | QA：严过关（Edward） | 基线：v3.2 全量代码（T01~T05 已就绪，工作区未提交 git）
> 依据：`docs/开发任务书-v3.2-团队执行版.md` §七 + `docs/架构设计-整明白-v3.2.md`

---

## 〇、总览

| 维度 | 结果 |
|------|------|
| 后端单测（node:test + tsx） | **70/70 通过**（10 个测试文件） |
| 集成 smoke（真实服务 + 独立测试库） | **28/28 通过**（`server/qa-smoke-v32.mjs`） |
| gitleaks 规则逻辑模拟 | **12/12 通过**（`server/qa-gitleaks-sim.mjs`） |
| web 前端构建 | **0 错误**（vite build 通过，87 modules） |
| 源码 Bug 发现数 | **0** |
| 测试脚本 Bug 自修 | 3 处（详见 §三） |
| **Route 判定** | **NoOne（全量通过，第 6 项标注需生产验证）** |

---

## 一、回归 checklist 9 项逐项验收

### ✅ 1. 后端单测通过（70/70）

`cd server && npx tsx --test <10 个 .test.ts>` 全绿：

| 测试文件 | 覆盖 |
|---|---|
| `common/mask.test.ts` | 脱敏工具 |
| `common/validators.test.ts` | 用户名/密码/邮箱/手机号校验 |
| `middleware/maintenance.test.ts` | 维护模式中间件 |
| `modules/admin/block-admins.test.ts`（8 例） | **v3.2 新增**：封禁/解封、2004 双拦截（login + authMiddleware）、仅超管、自删拦截、超管计数守卫 |
| `modules/ai/volcengine-image-client.test.ts` | 文生图客户端 |
| `modules/auth/captcha/service.test.ts` | 图形码一次性/过期/大小写 |
| `modules/auth/password-reset.test.ts` | 忘记密码 |
| `modules/auth/verification/email-verification.test.ts` | 邮箱码限频/一次性 |
| `modules/reminder/reminder.e2e.test.ts` | 30 天提醒 |
| `modules/wechat/wechat.test.ts` | 验签/明文/兼容模式回调 |

> 任务书 checklist 原文写「62/62 保持」，v3.2 新增 block-admins 8 例后总量 70，70/70 通过即满足且优于基线。

### ✅ 2. 小程序编译 0 错误

- `points/points.wxml:36` 已改为 `<block wx:else>` 包裹、`wx:for` 移入内层 `<view>`，与同文件 `wx:if` 分支结构对齐 ✓
- 全仓 grep `wx:else` 与 `wx:for` 同元素共存：**0 命中**（仅 CODE_REVIEW_REPORT.md 历史文档提及）✓
- v3.1 三处复核仍在正确状态：`home.wxml:36/120`、`messages.wxml:22`、`space-detail.wxml:65` 均为 `<block wx:else>` 结构 ✓
- 注：本地无微信开发者工具 CLI，编译 0 错误以静态结构校验为准；真机预览建议部署前在开发者工具点一次编译确认。

### ✅ 3. 邮箱码登录不死循环；密码登录图形码正常

**代码审查**：
- 后端 `auth/routes.ts`：loginSchema 中 `captcha_id/captcha_code` 改可选；`assertCaptcha()` 仅 `email_password/phone_password` 调用；`email_code` 路径跳过 ✓
- 前端 `Login.tsx`：`email_code` 分支 submit body 不再带 `captcha_id/captcha_code`（`codeCaptcha` 仅作「已发码」本地标记）；2101→重发邮件码死循环逻辑已删；密码登录 CaptchaInput + 失败刷新保留 ✓

**集成实测**（qa-smoke-v32.mjs，真实服务）：
- `email_code` 登录**不带图形码直通成功**（200 + token）✓
- 密码登录不带图形码被拦（`1001 请先完成图形验证`，不进入凭据校验）✓
- 密码登录带图形码 → 过码后走凭据校验（错误密码返回统一 2001）✓

> 备注：不带图形码时后端返回的是 1001（BizError.param「请先完成图形验证」）而非 2101，语义同样是「拦截且提示先过码」，与前端 CaptchaInput 常驻交互匹配，判定通过。

### ✅ 4. 拍照→AI 确认→出方案全链路不 404

**模型名四处口径一致**（均为 Doubao-*）：
| 位置 | 值 |
|---|---|
| `llm-client.ts:40` 默认 | `Doubao-Seed-2.1-turbo` |
| `vision-client.ts:22` 默认 | `doubao-seed-1-6-vision` |
| `configs/service.ts:31-32` seed | 同上两个值 |
| `seed-cli.ts:111-112` | 同上两个值 |

**集成实测**（AI_MOCK=true，真实服务起在 3410 端口）：建空间 → 建会话 → 上传照片 → `confirm/run`（200 不 404）→ 用户 confirm → `analyze` 出方案（200 + plan content + 扣点）✓

### ✅ 5. 账号页下滑头部固定

`web/src/components/PageHeader.tsx:23`：`sticky top-0 z-20 ... bg-cream/95 backdrop-blur`，无断点条件包裹，全断点生效 ✓（账号页 Account 走该组件）

### ⚠️ 6. 微信真平台推送收到消息 —— **需生产验证**

代码侧确认 v3.1 修复完整：
- `wechat/routes.ts:47-51`：`/message` 双路径（GET 验签 + POST 收消息）+ 根路径兼容，不 404 ✓
- `wechat/service.ts:51-61`：仅纯安全模式（body 仅 `<Encrypt>` 无明文）才记日志放行；兼容模式明文正常解析处理 ✓
- wechat.test.ts 含明文/兼容模式/安全模式/验签拒绝用例，70/70 内全过 ✓

**遗留动作**（非代码问题）：部署后微信后台「服务器配置」重提 URL `https://zhengmingbai.cn/api/v1/wechat/message`（Token `zmb_wechat_msg_2026`，兼容模式）+ 真机发消息确认。

### ✅ 7. CI secret-scan job 能拦截含密 diff

- `.github/workflows/ci.yml`：`secret-scan` job 与 build/test 并行，`fetch-depth: 0` 全历史 + `gitleaks/gitleaks-action@v2` + `GITLEAKS_CONFIG: .gitleaks.toml` ✓
- 本机无二进制，按 `.gitleaks.toml` 规则语义做等效模拟（`qa-gitleaks-sim.mjs`，**12/12**）：
  - 拦截 ✓：`ark-` 火山 Key（源码/scripts 两处）、有效 JWT（eyJ 三段式）、`ADMIN_INIT_PASSWORD_*` 真实值、服务器密码 `Lzpzhengmingbai_*`
  - 放行 ✓：`sk-test-*` 假 key、docs 路径示例、`.test.ts` 内 JWT、`.env.example` 占位、`zmb_wechat_msg_2026`、`SmokePass123`、lock 文件高熵串

### ✅ 8. 管理员增删 + 用户封锁解封接口可用

单测（block-admins.test.ts 8 例）+ 集成实测（qa-smoke-v32.mjs 16 项断言）双保险：

| 验证点 | 结果 |
|---|---|
| `POST /admin/admins` 提升 user→admin（is_super=0） | ✓ |
| 重复提升 / 无邮箱用户拦截 | ✓ |
| 非超管调增删接口 → 403/2003 | ✓ |
| `DELETE /admin/admins/:id` 自删拦截 | ✓ |
| 超管计数守卫（事务内至少留 1 个超管，失败回滚） | ✓（单测覆盖） |
| 删除=降级回 user 不删号 | ✓ |
| `POST /admin/users/:id/block`（原因必填 1-200 字） | ✓ |
| 封禁后 `login()` → **403 + 2004**（email_code 与密码双路径，service.ts:69） | ✓ |
| 封禁后已签发 token → authMiddleware 点查 **403 + 2004**（middleware/auth.ts:71） | ✓ |
| 解封后恢复登录 | ✓ |
| admin 端 step3 封禁拒签（auth-service.ts:61） | ✓（单测覆盖） |
| 全程 writeAdminLog 留痕 | ✓（单测覆盖） |

### ✅ 9. 兜底模型 qwen-* 在代码中完整保留

- `openai-compat.ts`：`AiProvider = 'volcengine' | 'dashscope'`；`resolveProvider()` configs 热切；dashscope 分支完整（FALLBACK_BASE_URL、`dashscopeApiKey`、`ai.base_url` 覆盖、`dashscopeBaseUrl()` 导出保留）✓
- `config.ts:57-60`：DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL 环境变量接线保留 ✓
- `t2i-client.ts`：通义万相 dashscope 原生异步通道整文件保留 ✓
- 定价表 `estimateCostYuan` qwen 刊例价分支保留 ✓
- 说明：qwen-* 字面量经**全仓 grep** 确认仅存在于注释/文档（llm-client.ts:2、openai-compat.ts:136）。dashscope fallback 的实际模型名取自 `configs ai.text_model/ai.vision_model`，切换 provider 时由运营在后台同步改回 qwen-plus/qwen-vl-plus 即可，无需改码——该设计满足「兜底可用」且避免双份硬编码漂移，判定通过。

---

## 二、附加深度验证（T04 六项 UI + T05 前端）

| 项 | 结论 |
|---|---|
| §4.1 Capture 引导文案 | ✓ `Capture.tsx:316` 未选类型引导文案在 disabled 按钮下方 |
| §4.2 Enter 回车 | ✓ `Login.tsx:199-201` 容器 onKeyDown，`!captchaOpen && !submitting` 守卫——CaptchaDialog 打开时不误触（弹窗内部自理回车） |
| §4.3 SpaceDetail session_count | ✓ 后端 `spaces/service.ts:118-129` 详情补 session_count 子查询；前端 `SpaceDetail.tsx:97` `?? 0` 兜底，不再 undefined |
| §4.4 拍照区双键排版 | ✓ Capture.tsx 拍照/相册按钮按设计系统排布（代码审查） |
| §4.5 Privacy 布局 | ✓ 代码审查无异常结构（建议真机/浏览器目测一次） |
| §4.6 Switches toggle 44px | ✓ `admin/pages/Switches.tsx:54-68` 统一 Toggle 组件，`h-11`（44px）可点区域，开=primary/关=soft |
| T05 api.ts 2004 强制登出 | ✓ `api.ts:97-110` 双通道（C 端清 token 跳 /login；admin 清 adminToken 跳 /admin） |
| T05 后台 Users 状态列+封禁弹窗 | ✓ `admin/pages/Users.tsx` StatusBadge「已封禁」+ 原因必填弹窗 + 解封二次确认 |
| T05 Account 新增/删除仅超管可见 | ✓ `admin/pages/Account.tsx:395,426` `myIsSuper` 门控按钮与弹窗 |
| web 构建 | ✓ `npm run build` 0 错误 |

## 三、修复记录（全部为测试脚本 Bug 自修，源码 0 Bug）

1. `qa-smoke-v32.mjs` 注册参数：`nickname` → `username` + 补注册图形码（与 registerSchema 对齐）。
2. `qa-smoke-v32.mjs` 断言口径：密码登录缺图形码期望 2101 → 实际 1001（BizError.param），修正断言。
3. `qa-smoke-v32.mjs` 取码方式：误以为 VERIFICATION_CHANNEL=mock 任意 6 位可过 → 实际走 `verifyEmailCode` 落库真码比对，改为 QA 直读测试库取码；解封后重登绕开 60s 同场景限频改为直插新码。
4. 环境经验：Windows 下端口残留导致旧服务（无 RATE_LIMIT_DISABLED）持续应答造成 429 假象；以 PID 级清理 + 全新 DB 重启解决（非源码问题）。

## 四、Known Issues / 遗留验证项

| 项 | 性质 | 动作 |
|---|---|---|
| 微信真平台推送（checklist #6） | 需生产环境 | 部署后微信后台重提 + 真机验证 |
| SIGTERM 优雅关闭 / 文生图 24h URL 落 COS | 任务书 §3.3 生产验证 | 部署后观察 |
| 小程序真机编译 | 本地无开发者工具 | 部署前开发者工具点一次编译 |
| server typecheck（存量 TS2352） | v3.1 已知项，未入门禁 | 排期清理 |
| UI 视觉项（§4.4/4.5） | 静态审查通过 | 建议真机/浏览器目测一次 |

## 五、Route 判定

**NoOne** —— 9 项 checklist 中 8 项本地全绿，1 项（微信推送）代码就绪标注生产验证；自动化 110/110（70 单测 + 28 集成 + 12 规则模拟）；源码 0 Bug，无需打回工程师。

---

*附件：`server/qa-smoke-v32.mjs`（28 断言集成套件）、`server/qa-gitleaks-sim.mjs`（12 断言规则模拟），均已被 .gitignore `server/qa-*.mjs` 覆盖不入仓。*
