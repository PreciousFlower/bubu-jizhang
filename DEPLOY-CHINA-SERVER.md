# 部署到阿里云 / 腾讯云轻量服务器（国内直连，最稳）

这是**国内访问体验最好**的方案：不需要备案（用 IP+端口访问）、不需要 VPN、不被墙、不需要信用卡、数据持久不会丢。

---

## 为什么选这个方案

| 其他方案遇到的问题 | 国内服务器 |
|---|---|
| Vercel `*.vercel.app` 被墙 | ✅ 国内直连 |
| Hugging Face 需要 VPN，挂 VPN 又报 418 | ✅ 不存在 |
| Render / Fly.io 要绑信用卡 | ✅ 支付宝/微信付款 |
| 免费层休眠、磁盘临时（重启丢数据） | ✅ 你的机器，永不休眠、磁盘持久 |

---

## 购买建议

| 项目 | 建议 |
|---|---|
| 产品 | **轻量应用服务器**（不要选 ECS/CVM，更贵更复杂） |
| 配置 | **2 核 2GB 起**（推荐 2 核 4GB，`sharp` 编译时更从容） |
| 系统镜像 | **Ubuntu 24.04** ⚠️ 必须 |
| 带宽 | 3~5 Mbps 足够（记账应用流量极小） |
| 地域 | 离你近的（上海/杭州/广州） |

> **注意**：轻量应用服务器控制台里叫「**防火墙**」，不是「安全组」—— 这是两套不同的机制，别找错地方。

---

## 部署步骤

### 1. 放行防火墙端口

控制台 → 服务器详情 → **防火墙** → 添加规则：

| 协议 | 端口 | 用途 |
|---|---|---|
| TCP | `22` | SSH 登录 |
| TCP | `7860` | App 访问 |

### 2. 装运行环境

服务器上执行（`deploy/step1-env.sh` 的内容）：

```bash
sudo apt-get update -qq
sudo apt-get install -y git curl ca-certificates build-essential python3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm config set registry https://registry.npmmirror.com   # 国内加速
```

### 3. 拉代码并构建

```bash
cd ~
git clone https://github.com/PreciousFlower/bubu-jizhang.git
cd bubu-jizhang

# ⚠️ 不能加 --ignore-scripts，sharp / better-sqlite3 要靠安装脚本取原生二进制
npm install --no-audit --no-fund

node scripts/check-runtime.mjs          # 原生模块自检，装不上会明确报错
node scripts/prepare-assets.mjs         # 采集贴图（失败会自动退回 emoji 占位）
npm run build
```

### 4. 配成开机自启的服务

用 `deploy/bubu-jizhang.service.template`，把 `__API_KEY__` 替换成真实密钥后：

```bash
sudo cp bubu-jizhang.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable bubu-jizhang
sudo systemctl start bubu-jizhang
sudo systemctl status bubu-jizhang
```

### 5. 验证

```bash
curl -s http://127.0.0.1:7860/api/health | head -c 300
```

外部访问：`http://<你的公网IP>:7860`

---

## 服务配置里几个必须注意的点

这些参数写错会导致很难排查的问题：

| 配置 | 值 | 为什么 |
|---|---|---|
| `PORT` | `7860` | **设了 `PORT` 后代码会监听 `0.0.0.0`**，容器/外网才能访问；不设则只监听回环地址 |
| `TRUST_PROXY` | **`false`** | 直连场景下前面没有反向代理。设成 `true` 会让所有访客被算成同一个 IP，**限流会误伤所有人** |
| `DEEPSEEK_API_KEY` | 你的密钥 | 只存在服务端，不下发前端 |
| `Restart=always` | 是 | 崩了自动拉起 |
| `systemctl enable` | 是 | 服务器重启后自动启动 |

---

## 常用运维命令

```bash
sudo systemctl status bubu-jizhang      # 看状态
sudo systemctl restart bubu-jizhang     # 重启
sudo journalctl -u bubu-jizhang -n 50   # 看日志（systemd 侧）
tail -f ~/bubu-jizhang/logs/service.log # 看应用日志
```

升级到最新代码：

```bash
cd ~/bubu-jizhang
git pull
npm install --no-audit --no-fund
npm run build
sudo systemctl restart bubu-jizhang
```

---

## 关于备案

| 访问方式 | 需要备案 |
|---|---|
| `http://IP:7860` | ❌ **不需要**，买完就能用 |
| `https://域名`（80/443 端口） | ✅ 需要，还要先买域名，审核 1~3 周 |

**建议先用 IP + 端口**，代码一行都不用改。以后想要好记的域名再备案。

---

## 常见问题

**外网打不开，但 `curl localhost:7860` 正常**
防火墙没放行 7860 端口。轻量服务器在「**防火墙**」里加，不叫安全组。

**服务显示 active 但立刻又停了**
`journalctl -u bubu-jizhang -n 100` 看具体报错。常见是 `DEEPSEEK_API_KEY` 那行写错、或 `WorkingDirectory` 路径不对。

**识别报 429**
触发了 AI 护栏（默认单 IP 每分钟 6 次、每天 40 次，全站每天 300 次）。等一分钟或改服务里的 `AI_RATE_*` 变量后重启。

**`sharp` 装不上**
内存不足（1GB 的机器常见）。加 swap，或升级到 2GB 以上：
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

**贴图没采集到**
`prepare-assets.mjs` 设计上不会让部署中断，采集失败只会退回 emoji 占位。手动重试：`node scripts/prepare-assets.mjs`。
