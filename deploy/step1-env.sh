#!/bin/bash
# 部署第一步：安装运行环境（Node 22 + 构建工具 + git）
# 由本地通过 SSH 调用，输出带 [STEP] 前缀便于追踪
set -e

echo "[STEP] 开始安装运行环境"
echo "[STEP] 当前用户: $(whoami)  系统: $(head -1 /etc/os-release)"

# 1) 系统更新与基础工具
echo "[STEP] apt update ..."
sudo apt-get update -qq

echo "[STEP] 安装基础工具（git / curl / build-essential / python3）"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  git curl ca-certificates build-essential python3 >/dev/null

echo "[STEP] 基础工具完成"
git --version
echo "gcc: $(gcc --version | head -1)"

# 2) Node.js 22（用 NodeSource 源）
if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -c2-3)" = "22" ]; then
  echo "[STEP] Node 22 已存在，跳过安装"
else
  echo "[STEP] 添加 NodeSource 源并安装 Node 22 ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi

echo "[STEP] Node 版本: $(node -v)"
echo "[STEP] npm  版本: $(npm -v)"

# 3) 把 npm 换成国内镜像（服务器在国内，官方源会慢）
echo "[STEP] 配置 npm 镜像为 npmmirror"
npm config set registry https://registry.npmmirror.com
npm config get registry

echo "[STEP] 环境安装完成 ✅"
