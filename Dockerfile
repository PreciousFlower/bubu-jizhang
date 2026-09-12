# 备用部署方式：任何支持 Docker 的平台（Fly.io / Railway / 自己的服务器）都能用。
# Render 用户直接用 render.yaml 更省事，不必用这个。
#
# 构建：docker build -t bubu-jizhang .
# 运行：docker run -p 8787:8787 -e DEEPSEEK_API_KEY=sk-xxx bubu-jizhang

# ---- 构建阶段 ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# 先只拷依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
# 这里不加 --ignore-scripts：让 sharp / better-sqlite3 走各自的安装流程，
# 镜像里有编译工具链，装不上预编译包时还能现场编译
RUN npm ci --include=dev

COPY . .
# 仓库里刻意不含版权贴图，构建时现场采集一次。
# 想跳过（界面退回 emoji 占位）：docker build --build-arg SKIP_ASSETS=1 ...
ARG SKIP_ASSETS=0
ENV SKIP_ASSETS=${SKIP_ASSETS}
RUN node scripts/prepare-assets.mjs
RUN npm run build

# ---- 运行阶段 ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 只搬运行期真正需要的东西
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

# 数据目录挂出去，容器重建也不丢账本
VOLUME ["/app/data"]
EXPOSE 8787
ENV PORT=8787

CMD ["node", "server/index.mjs"]
