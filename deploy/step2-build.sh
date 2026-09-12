#!/bin/bash
# 部署第二步：拉代码、装依赖、构建
# 由本地通过 SSH 调用
set -e

APP_DIR="$HOME/bubu-jizhang"
REPO="https://github.com/PreciousFlower/bubu-jizhang.git"

echo "[STEP] 拉取代码到 $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "[STEP] 目录已存在，执行 git pull"
  cd "$APP_DIR"
  git pull --ff-only || echo "[WARN] git pull 失败，继续使用现有代码"
else
  git clone --depth 1 "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

cd "$APP_DIR"
echo "[STEP] 当前提交: $(git log --oneline -1)"

# 生产依赖 + 构建依赖。
# 关键：**不能加 --ignore-scripts** —— sharp 与 better-sqlite3 是原生模块，
# 要靠安装脚本下载/编译二进制，跳过后运行时 require 会直接失败。
echo "[STEP] 安装依赖（含原生模块编译，可能较慢）..."
npm install --no-audit --no-fund

echo "[STEP] 原生模块自检"
node scripts/check-runtime.mjs

echo "[STEP] 采集贴图素材（从网络搜集，仅供个人使用）"
# 采集失败不让整个部署中断：没有素材时界面会用 emoji 占位
node scripts/prepare-assets.mjs || echo "[WARN] 贴图准备失败，界面将使用 emoji 占位"

echo "[STEP] 构建前端"
npm run build

echo "[STEP] 构建完成 ✅"
ls -la dist | head -5
