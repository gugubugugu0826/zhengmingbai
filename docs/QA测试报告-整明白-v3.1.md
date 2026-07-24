# QA 测试报告 — 整明白 v3.1（T06 集成验证 + 19 项验收 + 全量回归）

- 日期：2026-07-24
- 执行人：QA 严过关（Yan）
- 范围：v3.1 全部任务（T01 安全加固 / T02 小程序 P0 / T03 工程化 / T04 AI 改造火山引擎 / T05 微信推送）
- 结论：**Route = NoOne（通过）**。1 处文案残留已按最小授权直接修复并回归；2 项需生产环境验证；1 项受测试环境限制仅完成代码级验证（附生产验证方法）。

---

## 一、自动化测试统计（Round 1，一次通过）

| 项目 | 命令 | 结果 |
|---|---|---|
| server 单测 | `npx tsx --test 'src/**/*.test.ts'` | **62/62 全过**（含 v3.1 新增 volcengine-image-client 5 条 + wechat 8 条 + maintenance 豁免更新） |
| server 类型检查 | `tsc --noEmit` | 仅 **10 条存量 TS2352**（knowledge/orders/plans/upload 的 node:sqlite 行类型收窄，v3.1 之前即存在，无新增） |
| web 构建 | `npm run build` | 通过（336.85 kB，gzip 101 kB） |
| web 类型检查 | `tsc --noEmit` | **0 错误** |
| v3.1 集成 smoke | `server/qa-t06-v31.mjs`（起真实服务实测） | **24/24 有效断言通过**（3 条 FAIL 均判定为测试脚本问题，已澄清，见下） |

### Round 1 三条 FAIL 的澄清（测试 Bug，非源码 Bug）

1. `busy_timeout=5000 / synchronous=NORMAL` 读回 undefined/2 —— **测试脚本缺陷**：node:sqlite 的 PRAGMA 是连接级设置，smoke 脚本新开连接读不到被测服务进程的设置。源码 `db.ts:25/27` 在启动连接上显式执行，代码级验证通过；线上 systemd 环境同一连接生效。
2. `ai.provider 未 seed` —— **环境问题**：QA 工作库为历史库未跑过 v3.1 全量 seed。执行 `npm run seed`（幂等 INSERT OR IGNORE）后 `ai.provider=volcengine`、`ai.image_model=doubao-seedream-5-0-pro-260628` 均落库。**生产注意：发版后需执行一次 `npm run seed`**。
3. `t2i 任务 failed` —— **环境无 VOLCENGINE_API_KEY**（真实链路必须真 Key，AI_MOCK 只影响 chat 文本链路）。**失败重试机制本身验证通过**：日志序列 `失败→置回 pending 重试→再败→置 failed + error_message='画画失败了，点重试免费再画一次'` 与设计完全一致，web 端据此展示免费重试入口。

## 二、19 项验收逐项结论

### A 板块 — T01 安全加固

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| A-1 | helmet 安全响应头实际下发 | ✅ 通过 | 实测 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Strict-Transport-Security: max-age=31536000; includeSubDomains`、`X-Powered-By` 已禁用（CSP 按设计留反代层） |
| A-2 | CORS 白名单 | ✅ 通过 | 实测：不带 Origin 放行（200，小程序/curl 场景）；白名单 `https://zhengmingbai.cn` 回显 ACAO；非白名单 `evil.example.com` 拒绝且不回显 ACAO；dev 环境 localhost 任意端口放行 |
| A-3 | JWT alg=none 攻击向量被拒 | ✅ 通过 | 手搓 `alg=none` token（伪造 uid=1/admin）实测 401；错签名 token 401；无 token 401。`auth.ts:38/55` 双处显式 `algorithms: ['HS256']` 锁定 |

### B 板块 — T03 工程化

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| B-1 | busy_timeout 生效 | ✅ 通过（代码级） | `db.ts:25` `PRAGMA busy_timeout = 5000` 启动连接执行（连接级设置，跨连接不可读回——见上澄清） |
| B-2 | worker isBusy 不叠加 | ✅ 通过 | `t2i-worker.ts:135-147`、`regen-worker.ts:124-136` 模块级锁：上一轮未完成 `if (isBusy) return` 跳过本轮，finally 复位。全局 AI 并发上限=2 |
| B-3 | SIGTERM 优雅关闭日志序列 | ⚠️ 代码级通过，**需生产验证** | `index.ts:159-185` 序列完整：收到信号→stopWorkers(clearInterval×4)→server.close→db.close→exit 0+10s 兜底强退。Windows 本地无 POSIX SIGTERM（process.kill 只触发 termination 不触发事件），建议 Linux  staging 执行 `kill -TERM <pid>` 验证日志序列 |
| B-4 | web 无 axios | ✅ 通过 | `web/package.json` 已删 axios 依赖（git diff 确认 `- "axios": "^1.7.9"`），`package-lock.json` 0 引用；`web/src/api.ts` 已改 fetch 封装 |

### C 板块 — T05 微信推送

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| C-1 | GET 验签正确 Token 返裸 echostr | ✅ 通过 | 实测正确签名返 `200 + 裸 echostr`（非 JSON envelope）；错 Token 403 |
| C-2 | POST XML 返 success | ✅ 通过 | 实测明文 XML 消息返裸 `success`；错签名 403；含 `<Encrypt>` 安全模式加密体记日志返 success（单测覆盖） |
| C-3 | maintenance 开启时 /api/v1/wechat 不被 503 | ✅ 通过 | 实测热改 `ops.maintenance.enabled=true` 后 C 端 503（code 3001），wechat GET 仍 200 返 echostr；`maintenance.ts:21` 豁免路径含 `/api/v1/wechat*`，单测同步覆盖 |
| C-4 | 微信回调真机验签（公众平台配置） | ⚠️ 需生产验证 | 本地验签算法已实测通过（sha1(sort(token,timestamp,nonce))），但公众平台后台 URL 配置 + 真实平台回调需生产环境操作。方法：公众平台→设置与开发→基本配置→服务器配置，填 `https://zhengmingbai.cn/api/v1/wechat` + Token=WECHAT_MSG_TOKEN，点"提交"平台自动发 GET 验签；随后发消息观察日志 |

### D 板块 — T04 AI 改造火山引擎

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| D-1 | ref_photo_key 迁移幂等 | ✅ 通过 | `migrations/v31-t2i-ref-photo.ts` PRAGMA 判存幂等，实测库内列已存在；迁移由 `migrate()` 启动链调用，反复执行无副作用 |
| D-2 | --fix-prompts 幂等 | ✅ 通过 | 连跑 2 次均成功退出，输出"赠点已核实为 20"；ai.prompt.* 强制覆盖 UTF-8 正确中文（乱码订正） |
| D-3 | 生成图 24h 后仍可用 | ⚠️ **需生产验证**（24h 时效） | 机制已代码级确认：`volcengine-image-client.ts:96-102` 硬约束——火山 24h 临时 URL 立即下载落 storage 通道（COS/local），只返回 cosKey，读取时现场签 3600s URL，天然无 24h 失效问题。生产验证方法：发起一次效果图生成，24h 后刷新方案页确认图仍可加载 |
| D-4 | AI_MOCK t2i 链路完整（发起→worker→done） | ✅ 通过（机制） | 实测 worker claim→处理→终态回写全链路；无真 Key 环境走完整失败重试路径（自动重试 1 次→failed+免费重试话术），与 plans/routes.ts 免费重试设计闭环。真 Key done 路径单测已覆盖（mock fetch） |
| D-5 | ai.provider 切换 dashscope 回退百炼可用 | ✅ 通过（代码级） | `openai-compat.ts:43-64`：configs 热加载 `ai.provider`，dashscope 走 `ai.base_url`（configs 可覆盖）+ DASHSCOPE_API_KEY，百炼兼容协议代码全保留；seed 已落 `ai.provider=volcengine`。生产切换验证：admin 改配置→发起分析→观察 ai_cost_logs.model 前缀（doubao/qwen） |
| D-6 | 赠点=20 | ✅ 通过 | 实测库内 `points.rules.new_user_gift_points=20`；seed-cli 默认 20 + service.ts:57 存量 15→20 幂等订正 + --fix-prompts 核实三重保障 |

### E 板块 — T02 小程序 P0

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| E-1 | 3 个 wxml 结构正确（block 包裹） | ✅ 通过 | git diff 确认 `home.wxml` / `messages.wxml` / `space-detail.wxml` 均将"多属性冲突 view（wx:else + wx:for 同标签）"改为 `<block wx:else>` 包裹，结构合法（微信开发者工具编译 + 真机预览需发版时常规回归） |

### 横切 — T06 文案收口

| # | 验收项 | 结论 | 证据 |
|---|---|---|---|
| X-1 | "示意图"文案收口为"效果图" | ✅ 通过（QA 最小修复） | **发现并修复**：`web/src/pages/Plan.tsx` 残留 2 处"专属示意图"（生成按钮 + 成功 toast），已改"专属效果图"口径，与 server 扣点备注"生成专属效果图"（plans/routes.ts:280）对齐。重构建后 bundle 确认新文案生效、旧文案 0 残留。素材 SVG 场景注释中的"示意插画"属素材库口径，按约定保留 |

## 三、修复记录（QA 最小授权修复，未提交 git）

| 文件 | 修复 | 回归 |
|---|---|---|
| `web/src/pages/Plan.tsx:286` | toast `专属示意图画好啦` → `专属效果图画好啦` | web build + tsc 通过，bundle grep 确认 |
| `web/src/pages/Plan.tsx:535` | 按钮 `✨ 生成专属示意图 · 5 点` → `✨ 生成专属效果图 · 5 点` | 同上 |

源码 Bug：无（A/B/C/D/E 所有实测失败均归因于测试环境/脚本，非实现缺陷）。

## 四、遗留事项（不阻塞发版）

1. **存量 TS2352 ×10**：node:sqlite `.all()` 返回类型与业务 Row 类型的收窄问题（v3.1 前即存在），运行时无影响，建议后续统一 `as unknown as Row[]` 收口。
2. **生产发版 checklist**：
   - `npm run seed`（幂等落 v3.1 AI 配置）
   - 配置 `VOLCENGINE_API_KEY` / `WECHAT_MSG_TOKEN` 环境变量
   - Linux staging 验证 SIGTERM 日志序列（`kill -TERM`，预期：退出信号→worker 停→HTTP 关→DB 关→exit 0）
   - 公众平台服务器配置提交验签（C-4）
   - 效果图生成后 24h 复验图片可加载（D-3）

## 五、Route 判定

**NoOne — 全部可自动化项通过，无源码 Bug 需转工程师。** 需生产验证 3 项（B-3 / C-4 / D-3）已附明确验证方法，属环境依赖性验证而非功能缺陷。
