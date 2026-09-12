#!/bin/bash
# 等待 step1 环境安装完成，并报告结果
for i in $(seq 1 40); do
  if ! pgrep -f '/tmp/step1.sh' >/dev/null 2>&1; then
    break
  fi
  sleep 10
done

echo "=== 安装结果 ==="
if command -v node >/dev/null 2>&1; then
  echo "node: $(node -v)"
else
  echo "node: 未安装 ❌"
fi
if command -v npm >/dev/null 2>&1; then
  echo "npm:  $(npm -v)"
else
  echo "npm:  未安装 ❌"
fi
echo "npm registry: $(npm config get registry 2>/dev/null)"
echo "git: $(git --version 2>/dev/null)"
echo "gcc: $(gcc --version 2>/dev/null | head -1)"
echo "=== step1 日志尾部 ==="
tail -12 /tmp/step1.log 2>/dev/null || echo "(没有日志文件)"
