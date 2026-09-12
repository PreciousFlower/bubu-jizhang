# 多阶段构建：构建阶段装全部依赖并出产物，运行阶段只留运行期需要的东西。
#
# Koyeb / Fly.io / Railway / 自己的服务器都能直接用。
#   docker build -t bubu-jizhang .
#   docker run -p 8787:8787 -e DEEPSEEK_API_KEY=sk-xxx -v $(pwd)/data:/app/data bubu-jizhang
#
# Koyeb 用户：不需要手动 build，平台会读这个文件；记得在控制台加环境变量并挂持久卷到 /app/data。

# ============================ 构建阶段 ============================
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先只拷依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
# 注意：这里**不能**加 --ignore-scripts。
# sharp 与 better-sqlite3 是原生模块，要靠各自的安装脚本去取/编译二进制；
# 跳过后运行时会在 require 阶段直接报错（这也是 scripts/check-runtime.mjs 要拦的情况）。
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
WORKDIR /app
ENV NODE_ENV=production

# 同样不能加 --ignore-scripts，理由同上
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 只搬运行期真正需要的东西
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts

# 启动前自检原生模块，装不上就立刻报错退出，而不是带病启动
RUN node scripts/check-runtime.mjs

# 数据目录：挂持久卷到这里，容器重建也不丢账本
VOLUME ["/app/data"]
EXPOSE 8787
ENV PORT=8787

CMD ["node", "server/index.mjs"]
