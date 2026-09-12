# 部署到 Koyeb（不需要信用卡）

Koyeb 免费层提供 Web Service，支持直接读仓库里的 `Dockerfile` 部署。**注册不需要绑卡。**

免费层的两个已知限制：
- 闲置一段时间后会休眠，首次访问要等冷启动
- 默认磁盘是临时的，**重新部署会清空数据** → 靠下面的「第 5 步：挂持久卷」解决

---

## 部署步骤

### 第 1 步：注册 Koyeb

打开 https://app.koyeb.com/auth/signup → 选 **Continue with GitHub** → 授权

### 第 2 步：新建服务

控制台里点 **Create Service** → 选 **GitHub**
- 第一次会让你授权访问仓库，选 **Only select repositories** → 勾 `bubu-jizhang`
- 然后选中 `bubu-jizhang`

### 第 3 步：确认构建方式

Koyeb 会检测到仓库里有 `Dockerfile`，自动选 **Dockerfile builder**。

- **Builder**：`Dockerfile`
- **Dockerfile location**：`Dockerfile`（根目录，默认就对）
- **Branch**：`main`

如果它默认选了 Buildpack，手动改成 Dockerfile —— Buildpack 那条路对原生模块（sharp / better-sqlite3）不友好。

### 第 4 步：填环境变量 ⭐ 关键

在 **Environment variables** 里加：

| Key | Value | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | `sk-...你的密钥...` | **必填**，不加就用不了 AI 识别 |
| `AI_ENABLED` | `true` | AI 识别总开关 |
| `AI_RATE_PER_MIN` | `6` | 单 IP 每分钟上限 |
| `AI_RATE_PER_DAY` | `40` | 单 IP 每天上限 |
| `AI_GLOBAL_PER_DAY` | `300` | 全站每天上限（熔断） |
| `AI_GLOBAL_TOKENS_PER_DAY` | `1200000` | 全站每天 token 上限（熔断） |
| `TRUST_PROXY` | `true` | 反代后必须开，否则限流会把所有访客算成一个 IP |

**端口不用填** —— 代码读平台注入的 `PORT`，监听 `0.0.0.0`，Koyeb 会自动对接。

### 第 5 步：挂持久卷（强烈建议）

在 **Volumes** 里加一个卷：

- **Mount path**：`/app/data`
- **Size**：1 GB 就够（记账数据很小）

不挂的话，每次重新部署账本都会清空。

### 第 6 步：Health check（可选但建议）

- **Protocol**：HTTP
- **Path**：`/api/health`
- **Port**：与主端口相同

### 第 7 步：部署

选实例规格（**Free**）→ 点 **Deploy**

构建大约 3~5 分钟（要装依赖 + 采集贴图 + 构建前端）。完成后你会拿到一个网址：

```
https://bubu-jizhang-<你的用户名>.koyeb.app
```

**这个网址可以直接发给朋友，点开就能用。**

---

## 部署完成后自检

打开网址后，进 **设置** 页，确认：

| 检查项 | 应该显示 |
|---|---|
| 密钥状态 | ✅ 已配置 |
| 识别模型 | `deepseek-flash` |
| 当前 prompt | `v3` |
| 存储驱动 | `sqlite`（如果是 `json`，说明没挂持久卷或原生模块有问题） |
| 已记账笔数 | 数字 |

然后去 **拍照记账** 页，传一张小票或支付截图，确认能识别出金额。

也可以直接访问 `https://你的网址/api/health` 看 JSON 状态。

---

## 常见问题

**构建失败，报原生模块相关错误**
`Dockerfile` 里两个 `npm ci` **都不能加 `--ignore-scripts`**，否则 sharp / better-sqlite3 的二进制不会安装。镜像构建末尾有 `node scripts/check-runtime.mjs`，装不上会直接失败而不是带病启动。

**构建时贴图采集失败**
`scripts/prepare-assets.mjs` 在设计上不会让构建中断 —— 采集失败只会让界面退回 emoji 占位。想彻底跳过：在环境变量里加 `SKIP_ASSETS=1`。

**访问时报 502 / 一直转圈**
看 Koyeb 的日志。常见原因是没填 `DEEPSEEK_API_KEY`（不会导致 502）或者健康检查路径写错。

**重新部署后账本空了**
没挂持久卷，或者挂载路径不是 `/app/data`。

**识别报 429**
触发了护栏。等到下一个整点/第二天自动恢复。想调宽就改环境变量里的那几个上限。要临时全关：`AI_ENABLED=false`。
