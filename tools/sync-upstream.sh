#!/usr/bin/env bash
# 同步上游新增组件：拉取 → 合并 → 找出缺中文的组件 → 生成翻译工作单
# 用法: tools/sync-upstream.sh [batchSize]
set -euo pipefail
cd "$(dirname "$0")/.."
BATCH="${1:-20}"

echo "== 1/4 拉取上游 =="
git fetch upstream
git log --oneline HEAD..upstream/main | head -20 || true

echo "== 2/4 合并上游 main =="
if git merge-base --is-ancestor upstream/main HEAD; then
  echo "已是最新，无需合并"
else
  git merge upstream/main -m "chore: merge upstream/main" || {
    echo "合并有冲突：src/elements 与 src/tokens.css 请保留上游版本，语言包冲突请保留本地版本。"
    exit 1
  }
fi

echo "== 3/4 宽松构建（列出缺失的中文翻译）=="
node src/build.mjs || true

echo "== 4/4 生成翻译工作单 work/batch/batch-NN.json =="
node tools/extract-zh-work.mjs "$BATCH"

cat <<'TIP'

下一步：
  1. 把 work/batch/*.json 与 work/GLOSSARY.md 交给翻译（人工或 AI 代理）
  2. 译文写到 work/out/batch-NN.json（格式见 docs/SYNC-UPSTREAM.md）
  3. node tools/merge-zh.mjs && npm run build
TIP
