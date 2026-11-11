#!/usr/bin/env bash
# ==============================================================================
# 分子视界 ChemVistas — 生产发布与质量校验构建脚本
# 用法:
#   bash scripts/build-release.sh             # 类型检查 + 单元测试 + 构建 dist/
#   bash scripts/build-release.sh --archive   # 额外打包 release/chemvistas-dist.tar.gz
#   VITE_BASE_PATH=/chemvistas/ bash scripts/build-release.sh
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CREATE_ARCHIVE=false
for arg in "$@"; do
  case "$arg" in
    --archive)
      CREATE_ARCHIVE=true
      ;;
    *)
      echo "未知参数: $arg"
      echo "用法: bash scripts/build-release.sh [--archive]"
      exit 1
      ;;
  esac
done

echo "==> [1/5] 检查构建环境..."
echo "    Node.js : $(node -v)"
echo "    npm     : $(npm -v)"

if [ ! -d "node_modules" ]; then
  echo "==> [2/5] 未检测到 node_modules，正在安装依赖..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
else
  echo "==> [2/5] 依赖目录已就绪 (node_modules)"
fi

echo "==> [3/5] 运行 TypeScript 静态类型检查..."
npm run lint

echo "==> [4/5] 运行化学计算与三维反应路径单元测试..."
npm run test

echo "==> [5/5] 构建生产级静态产物 (VITE_BASE_PATH=${VITE_BASE_PATH:-./})..."
rm -rf dist
VITE_BASE_PATH="${VITE_BASE_PATH:-./}" npm run build

# 生成 .nojekyll，避免 GitHub Pages 使用 Jekyll 过滤下划线资源
touch dist/.nojekyll

echo ""
echo "==> 构建成功！产物概览 (dist/):"
ls -lh dist
if [ -d "dist/assets" ]; then
  ls -lh dist/assets
fi

if [ "$CREATE_ARCHIVE" = true ]; then
  mkdir -p release
  ARCHIVE_PATH="release/chemvistas-dist.tar.gz"
  tar -czf "$ARCHIVE_PATH" -C dist .
  echo ""
  echo "==> 已打包发布归档文件: $ARCHIVE_PATH ($(du -h "$ARCHIVE_PATH" | cut -f1))"
fi
