# 多阶段构建：构建阶段装全部依赖并出产物，运行阶段只留运行期需要的东西。
#
# 适用：Hugging Face Spaces / Fly.io / Railway / Koyeb / 自己的服务器
#   docker build -t bubu-jizhang .
#   docker run -p 7860:7860 -e DEEPSEEK_API_KEY=sk-xxx -v $(pwd)/data:/data bubu-jizhang
#
# 关键设计（都是踩坑换来的，改动前请先看清楚）：
#   1. 两个 npm ci 都**不能**加 --ignore-scripts —— sharp / better-sqlite3 是原生模块，
#      要靠安装脚本取二进制，跳过后运行时 require 会直接失败。
#   2. 运行阶段用非 root 的 UID 1000。Hugging Face Spaces 强制以 UID 1000 运行容器，
#      如果用 root 建目录，运行时无权限写入 → 存储静默降级、数据丢失。
#   3. 数据目录通过 DATA_DIR 指定，Spaces 的持久化存储挂在 /data。

# ============================ 构建阶段 ============================
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先只拷依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

# 仓库里刻意不含版权贴图，构建时现场采集一次。
# 跳过采集（界面退回 emoji 占位）：docker build --build-arg SKIP_ASSETS=1 .
ARG SKIP_ASSETS=0
ENV SKIP_ASSETS=${SKIP_ASSETS}
RUN node scripts/prepare-assets.mjs

# 构建前端（内部会先跑 tsc 类型检查）
RUN npm run build

# ============================ 运行阶段 ============================
FROM node:22-bookworm-slim AS runtime

# Spaces 要求以 UID 1000 运行，这里先建好对应用户
RUN useradd -m -u 1000 bubu

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 只搬运行期真正需要的东西
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts

# 启动前自检原生模块，装不上就立刻报错退出，而不是带病启动
RUN node scripts/check-runtime.mjs

# 数据目录：容器内默认放 /data，方便挂载（Spaces 的持久化存储也在这里）。
# 目录必须属于 UID 1000，否则运行时无权限写入。
ENV DATA_DIR=/data
RUN mkdir -p /data && chown -R bubu:bubu /data /app
VOLUME ["/data"]

USER bubu

# 7860 是 Hugging Face Spaces 的约定端口；其它平台会注入 PORT 覆盖它
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server/index.mjs"]
