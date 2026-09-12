# 🐼 布布记账 · 一起攒小钱钱

一个「布布一二」风格的可爱记账 App。最大特点是：**把你随手拍的小票 / 支付截图丢进去，AI 自动算出实际花了多少钱，生成一条记账记录。**

<p align="center">
  <b>纯前端？不，是全栈单进程：</b>Express 同时提供 API 和前端静态文件，一个 <code>npm start</code> 就能跑起来。
</p>

---

## ⚠️ 两个必须先读的说明

### 1. 版权

本项目的**代码与界面为原创实现**。App 内使用的卡通贴图是**从互联网搜集**的，版权归原作者所有，仅供个人学习使用，**不商用、不再分发**。

因此 —— **仓库里刻意不包含任何贴图素材**（`public/bubu/*.webp`、`manifest.json` 都在 `.gitignore` 里）。贴图有两种获得方式：

```bash
# 方式一（推荐）：本机采集。会从图片搜索抓取 20 组生活场景的插画，做像素清洗 + 双重抠底 + 视觉筛选
npm run fetch:assets && node scripts/review-assets.mjs --vision

# 方式二：部署时自动采集（render.yaml / Dockerfile 里已经接好，见下文「部署」）
```

**没有贴图时界面不会破图**，会自动退回 emoji 占位。没有自绘插画兜底 —— 这是刻意的设计约束。

### 2. 部署到公网 = 把你的 API Key 开放给全网

这个 App 的 AI 识别靠服务端的 `DEEPSEEK_API_KEY`。一旦部署到公网且不设限，**任何访客（包括扫描器）都能消耗你的额度**。

所以内置了**三层护栏**（`server/lib/guard.mjs`）：

| 护栏 | 默认值 | 环境变量 | 作用 |
|---|---|---|---|
| 单 IP 每分钟限流 | 6 次/分 | `AI_RATE_PER_MIN` | 防止单个访客高频刷 |
| 单 IP 每日限流 | 40 次/天 | `AI_RATE_PER_DAY` | 防止单人刷爆 |
| 全站每日熔断 | 300 次 / 120 万 token | `AI_GLOBAL_PER_DAY`、`AI_GLOBAL_TOKENS_PER_DAY` | 兜底：即使被分布式刷，总花费也有上限 |
| 一键关闭 | `AI_ENABLED=true` | `AI_ENABLED` | 出事时设为 `false`，记账功能完全不受影响 |

- 触发限流返回 **HTTP 429** 并带 `Retry-After` 头，前端会显示友好提示，不会白屏。
- 可用 `npm run verify:guard` 实测拦截是否生效。
- **强烈建议**同时在 DeepSeek 控制台给这个 Key 设置消费上限 —— 这是最后一道保险。

---

## 快速开始

```bash
# 1. 安装依赖
#    Windows 受限环境下这两个参数是必须的，原因见文末「环境坑」
npm install --ignore-scripts --cache .npm-cache

# 2. 配置识别密钥
cp .env.example .env.local      # Windows: copy .env.example .env.local
#    然后编辑 .env.local，填入 DEEPSEEK_API_KEY

# 3. 采集贴图（可选，不采集就用 emoji 占位）
npm run fetch:assets && node scripts/review-assets.mjs --vision

# 4. 同时启动前端 + 后端
npm run dev
#   前端 http://127.0.0.1:5273
#   后端 http://127.0.0.1:8787

# 想灌一点演示数据看统计页效果
npm run seed:demo          # 清空：npm run seed:demo -- --clear
```

> `npm run dev` 会同时起两个进程（Vite 开发服务器 + API）。生产模式下只需要 **一个** 进程：
> `npm run build && npm start`，此时 Express 会直接托管 `dist/`，前后端同源。

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 识别用的密钥，**只存在服务端** | 必填 |
| `DEEPSEEK_BASE_URL` | 接口地址（OpenAI 兼容） | `https://api.deepseek.com` |
| `DEEPSEEK_VISION_MODEL` | 视觉模型名 | `deepseek-flash` |
| `PORT` / `API_PORT` | 监听端口（平台注入 `PORT` 优先） | `8787` |
| `AI_*` | 见上文护栏表 | 见上文 |
| `TRUST_PROXY` | 部署在反代后必须为 `true`，否则所有访客会被算成同一个 IP | `true` |

---

## 部署到公网（让朋友点开就能用）

已经准备好两份配置，选一个即可：

### 方案 A：Render（推荐，免费）

1. 把仓库推到 GitHub（公开仓库即可）
2. Render 控制台 → **New → Blueprint** → 选中这个仓库（它会读根目录的 `render.yaml`）
3. 在环境变量面板里填 `DEEPSEEK_API_KEY`（`render.yaml` 里标了 `sync: false`，不会进仓库）
4. 部署完就能拿到 `https://xxx.onrender.com`，直接点开使用

构建时会自动执行 `scripts/prepare-assets.mjs` 现场采集贴图；采集失败也不影响启动（退回 emoji）。

**免费实例的两个注意点**：
- 闲置一段时间会休眠，首次访问要等 30~60 秒冷启动
- 磁盘是临时的，**重新部署会清空 SQLite 里的账本数据**。想要数据不丢：升级到带 Persistent Disk 的实例，或把存储换成外部数据库（数据层已抽成 `server/lib/store.mjs`，换实现不影响上层）

### 方案 B：Docker（任何平台）

```bash
docker build -t bubu-jizhang .
docker run -p 8787:8787 \
  -e DEEPSEEK_API_KEY=sk-xxxx \
  -v $(pwd)/data:/app/data \
  bubu-jizhang
```

`data/` 挂出来，容器重建也不丢账本。`SKIP_ASSETS=1` 可跳过构建期的贴图采集。

> **为什么不用 GitHub Pages？** Pages 只能托管静态文件，没有 Node 进程 —— 这个 App 的 API、密钥保管、SQLite 存储全都依赖服务端，放上去只会是一堆 404。想要"纯静态 + 点开即用"，需要把存储层改写成 IndexedDB，并且仍然要用户自备 Key（因为 Key 不能写在公开的静态站里）。

---

## 功能一览

| 页面 | 能做什么 |
|---|---|
| 🏠 小账本 | 本月结余、预算进度、今日/本月收支、分类快捷记账、按天分组的流水（点一下可改可删） |
| 📷 拍照记账 | 拖拽 / 点击 / **Ctrl+V 粘贴**上传凭证，AI 识别金额 → 人工确认 → 入账 |
| 📊 看看花销 | 环形图、每日柱状图、分类排行榜、收支对比，可按月切换 |
| ⚙️ 设置 | 改预算、看 AI 服务与额度状态、导出 JSON、清空数据 |
| ＋ 记一笔 | 手动记账，超大金额键盘、贴图分类、心情标签 |

### 拍照记账的工作流程

```
你选图 ──▶ 浏览器侧压缩 ──▶ POST /api/vision/recognize（base64 内联）
                                   │
                          ① 过护栏：限流 + 每日额度熔断（429 直接返回）
                                   │
                          ② sharp 归一化（长边 ≤1536、转 JPEG）
                                   │
                          ③ 内容哈希查缓存 ──命中──▶ 直接返回
                                   │未命中
                                   ▼
                    ④ deepseek-flash（response_format: json_object）
                                   │
                    ⑤ 解析 JSON ──▶ 金额对账 ──▶ 置信度压制
                                   │
                    ⑥ 回填 token 消耗（用于全站额度熔断）
                                   │
                                   ▼
                    返回结构化结果 + needs_review 标记
                                   │
                     低置信度 ──▶ 强制要求人工核对金额
                                   │
                          点「确认记账」才真正落库
```

识别结果示例：

```json
{
  "is_bill": true,
  "doc_type": "payment_screenshot",
  "merchant": "茶颜悦色",
  "total": 18,
  "currency": "CNY",
  "date": "2026-03-08",
  "time": "15:22",
  "items": [],
  "suggested_category": "drink",
  "confidence": 0.96,
  "warnings": []
}
```

---

## 识别精度（有真实评测数据）

16 张夹具逐张评测，含"抹掉合计行""同图多金额""合计被遮挡""非账单插画"等难样本：

| 版本 | 金额正确率 | 分类正确率 | 非账单误判 |
|---|---|---|---|
| v1 裸 prompt | 0/14 (0%) | 0% | 0/2 |
| v2 强 schema | 14/14 (100%) | 92.9% | 0/2 |
| **v3 few-shot + 对账 + 拒答兜底** | **14/14 (100%)** | **100%** | **0/2** |

v3 在"合计被手指挡住"的样本上不会编数字，而是明确输出：
`"票据下方被截断，未见合计/实付行"`、`"total 由两项商品金额相加得出 33.50，非图片直接标注值"`，并把置信度降到 0.6 触发人工确认。

跑评测：`npm run make:fixtures && npm run eval:vision`（夹具是**本地用 sharp 渲染**的，金额精确可控、离线可复现，不依赖文生图服务）。

---

## 目录结构

```
├─ PROMPT.md                  # 完整构建 prompt（技术路径 + 方案 + 踩坑 + 验证方法学）
├─ render.yaml                # Render 一键部署蓝图
├─ Dockerfile                 # 通用容器部署
├─ server/
│  ├─ index.mjs               # Express：CRUD / 统计 / 上传 / 识别代理 / 生产静态托管
│  └─ lib/
│     ├─ store.mjs            # 数据层：SQLite 优先，失败自动降级 JSON
│     ├─ vision.mjs           # 图片归一化、上游调用、重试、金额对账、缓存
│     ├─ prompts.mjs          # 识别 prompt 版本库（v1/v2/v3，不原地改历史版本）
│     └─ guard.mjs            # AI 三层护栏：IP 限流 + 全站熔断 + 一键开关
├─ src/
│  ├─ App.tsx                 # hash 路由 + 布局
│  ├─ components/             # AppShell（全局状态/Toast/撒花）、BottomNav
│  ├─ lib/                    # api 客户端、金额日期工具、贴图资源库
│  └─ pages/                  # 首页 / 记一笔 / 拍照记账 / 统计 / 设置
├─ scripts/
│  ├─ fetch-assets.mjs        # 从网络搜集贴图
│  ├─ review-assets.mjs       # 清洗 + 抠底 + 视觉筛选
│  │                          #   --vision     额外做视觉筛选
│  │                          #   --recompute  按新门槛重算可用性（不调模型）
│  │                          #   --reprocess  只重跑像素处理，复用已下载原图
│  ├─ prepare-assets.mjs      # 部署构建时调用：采集→筛选→重建
│  ├─ make-fixtures.mjs       # 本地渲染识别评测夹具
│  ├─ eval-vision.mjs         # 识别精度评测，写 logs/iter-N.md
│  ├─ verify-ui.mjs           # 真实浏览器逐页截图 + 端到端上传识别验证
│  ├─ measure-layout.mjs      # 几何量测：底部导航是否遮挡内容
│  ├─ review-shots.mjs        # 视觉模型评审截图
│  ├─ test-guard.mjs          # 实测护栏拦截是否生效
│  └─ seed-demo.mjs           # 演示数据（--clear 清空）
├─ fixtures/bills/            # 识别评测夹具 + 标准答案
└─ logs/                      # 评测报告、截图、验证留痕
```

---

## 常用命令

```bash
npm run dev              # 前端 + 后端一起起
npm run build            # 类型检查 + 生产构建
npm start                # 生产模式单进程启动（API + 静态前端）

npm run fetch:assets     # 采集贴图（--per-key 12 控制每个关键词张数）
npm run review:assets    # 清洗 + 视觉筛选
npm run make:fixtures    # 生成识别评测夹具
npm run eval:vision      # 跑识别精度评测

npm run verify:ui        # 真实浏览器逐页截图 + 端到端识别验证
npm run verify:layout    # 量底部导航是否遮挡内容（几何量测，不靠肉眼）
npm run verify:guard     # 实测 AI 护栏拦截
npm run review:shots     # 视觉模型评审截图
npm run seed:demo        # 演示数据（--clear 清空）
```

---

## 环境坑（Windows + 受限沙箱，照着做能少走弯路）

1. **`npm install` 报 EPERM**：默认缓存目录在工作区外，且生命周期脚本会 `spawn EPERM`。解决：`npm install --ignore-scripts --cache .npm-cache`（`.npmrc` 里已配好）。
2. **PowerShell 的 `Invoke-WebRequest` / `curl.exe` 连不上网**，只有 **Node 的 `fetch`** 能出网。所有采集脚本都是 `.mjs` + node 跑的。
3. **Vite 报 `spawn EPERM`**：Vite 在 Windows 上会 spawn 子进程做真实路径检查，esbuild 也需要管道启动 service。受限沙箱下无法构建，需在放宽权限的环境执行。
4. **服务端脚本不能带 TS 类型注解**：`server/**/*.mjs` 是纯 ESM，写 `export type` 会直接语法报错，类型信息写在 JSDoc 里。
5. **`response_format: json_object` 要求 prompt 里出现英文 "json"**：中文"只输出"不算，会直接 400。见 `PROMPT.md` 第 10 节。

---

## 数据

- 记账数据默认存 `data/bubu.db`（SQLite）；原生模块不可用时自动降级 `data/db.json`，接口层无感。
- 上传的凭证原图存 `data/uploads/`，静态托管在 `/uploads/*`。
- 设置页可一键导出全部数据为 JSON。
