# 部署到 Hugging Face Spaces（不需要信用卡）

选择 Spaces 的原因：它给 Docker 应用提供**免费、有公网 HTTPS 域名、不休眠**的托管，而且注册不需要绑卡。

但有一个必须提前知道的限制 👇

---

## ⚠️ 先读这条：免费层的数据是临时的

Hugging Face 官方文档写得很明确（原文见 [Disk usage on Spaces](https://raw.githubusercontent.com/huggingface/hub-docs/main/docs/hub/spaces-storage.md)）：

| 存储档位 | 空间 | 是否持久 | 价格 |
|---|---|---|---|
| **Free tier** | 50 GB | ❌ **临时**（重启/停止就清空） | 免费 |
| Small | 20 GB | ✅ 持久 | $5 / 月 |
| Medium | 150 GB | ✅ 持久 | $25 / 月 |

也就是说：**免费方案下，Space 每次重启（重新部署、闲置后重启）账本数据都会被清空。**

三个应对方式，按成本排序：

1. **把账本当"体验版"** —— 挂上就能用，重启后从零开始。适合给朋友演示。
2. **换成免费的外部数据库** —— Neon / Turso / Supabase 都提供免费 Postgres 或 SQLite，不要卡。需要我改一下 `server/lib/store.mjs`（数据层已经抽象好，加一个驱动即可，不影响上层）。
3. **花 $5/月** 开持久存储 —— Spaces 会把持久卷挂在 `/data`，我已经把默认数据目录设为 `/data`，开了就能直接用。

> 平时记得用 **设置 → 导出全部数据（JSON）** 备份，重新部署后再手动录回去。

---

## 部署步骤

### 第 1 步：注册 Hugging Face

打开 https://huggingface.co/join → 填邮箱和密码（**不需要信用卡**）

### 第 2 步：新建 Space

打开 https://huggingface.co/new-space

| 字段 | 填什么 |
|---|---|
| Owner | 你的用户名 |
| Space name | `bubu-jizhang` |
| License | `mit` |
| **Select the Space SDK** | **Docker** → 选 **Blank** |
| Space hardware | **CPU basic · 2 vCPU · 16 GB · FREE** |
| Visibility | **Public**（要发给朋友就选公开） |

点 **Create Space**

### 第 3 步：把代码推上去

Space 创建后会告诉你两种方式。**用"从已有仓库导入"最省事**：

进入刚建好的 Space → 上方 **Files** 标签 → 右上角 **⋮** → **Import files**（或直接在 Settings 里找）

更稳的做法是用命令行（在你自己电脑上跑，把 `<你的用户名>` 换成实际用户名）：

```bash
cd E:\vibecoding\jizhang
git remote add hf https://huggingface.co/spaces/<你的用户名>/bubu-jizhang
git push hf main:main
```

推送时会要求登录：
- 用户名填你的 HF 用户名
- 密码要用 **Access Token**（不是账号密码）：打开 https://huggingface.co/settings/tokens → **New token** → 类型选 **Write** → 复制

> 说明：`git push hf main:main` 推的是 `main` 分支。Spaces 默认读 `main`，不用改。

### 第 4 步：配置密钥 ⭐ 关键

进入 Space → **Settings** 标签 → **Variables and secrets** → **New secret**

| Name | Value |
|---|---|
| `DEEPSEEK_API_KEY` | `sk-...你的密钥...` |

同一个区域再加几个**普通变量**（Variables，不是 Secret）：

| Name | Value | 作用 |
|---|---|---|
| `AI_ENABLED` | `true` | AI 识别总开关 |
| `AI_RATE_PER_MIN` | `6` | 单 IP 每分钟上限 |
| `AI_RATE_PER_DAY` | `40` | 单 IP 每天上限 |
| `AI_GLOBAL_PER_DAY` | `300` | 全站每天上限（熔断） |
| `AI_GLOBAL_TOKENS_PER_DAY` | `1200000` | 全站每天 token 上限（熔断） |
| `TRUST_PROXY` | `true` | Spaces 在反代后面，必须开 |

> `DATA_DIR` 不用填 —— 镜像里已经默认设成 `/data`。
> `PORT` 也不用填 —— Spaces 会注入，`README.md` 里的 `app_port: 7860` 已经声明好了。

### 第 5 步：等构建

Space 会自动开始构建（大约 3~6 分钟：装依赖 → 采集贴图 → 构建前端 → 自检 → 启动）。

构建日志可以在 Space 页面的 **Logs** 标签实时看。

构建完成后，你的网址是：

```
https://huggingface.co/spaces/<你的用户名>/bubu-jizhang
```

应用本身的直连地址（更适合发给朋友）：

```
https://<你的用户名>-bubu-jizhang.hf.space
```

**这个地址点开就能用。**

---

## 部署后自检

打开应用 → 进 **设置** 页，确认：

| 检查项 | 应该显示 |
|---|---|
| 密钥状态 | ✅ 已配置 |
| 识别模型 | `deepseek-flash` |
| 当前 prompt | `v3` |
| 存储驱动 | `sqlite`（显示 `json` 说明 `/data` 写不进去，看下面的排查） |
| 已记账笔数 | 数字 |

然后去 **拍照记账**，传一张小票或支付截图，确认能识别出金额。

也可以直接访问 `https://<你的用户名>-bubu-jizhang.hf.space/api/health` 看 JSON 状态。

---

## 常见问题

**构建失败，报原生模块错误**
`Dockerfile` 里两个 `npm ci` 都不能加 `--ignore-scripts`。镜像构建末尾有 `node scripts/check-runtime.mjs` 自检，装不上会明确报出来。

**存储驱动显示 `json` 而不是 `sqlite`**
说明 `/data` 目录不可写。`Dockerfile` 里已经建了 UID 1000 用户并把 `/data` 的属主给了它（Spaces 强制以 UID 1000 运行容器）。如果还出问题，检查是不是改过 `USER` 指令。

**Space 显示 Running 但页面 502**
看 Logs。常见原因是没配 `DEEPSEEK_API_KEY`（这个不会导致 502）或端口不对 —— 确认 `README.md` 顶部的 `app_port: 7860` 还在。

**识别报 429**
触发了护栏，等到下一个整点或第二天自动恢复。想调宽就改那几个 `AI_*` 变量。要临时全关：`AI_ENABLED=false`。

**重启后账本空了**
免费层的临时磁盘。见本文开头的说明，三个应对方式里选一个。

**构建时贴图没采集到**
`scripts/prepare-assets.mjs` 设计上不会让构建中断，采集失败只会退回 emoji 占位。想彻底跳过：加变量 `SKIP_ASSETS=1`。
