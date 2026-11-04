#!/bin/bash
set -u
project_dir="$(cd "$(dirname "$0")/.." && pwd -P)"
missing=0
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  printf '当前后台仅支持 Apple Silicon Mac。\n'
  missing=1
else
  printf '系统架构：Apple Silicon Mac\n'
fi
if [ -d '/Applications/DeepSeek Harness.app' ]; then
  printf 'DeepSeek Harness：已找到\n'
else
  printf '未在 /Applications 找到 DeepSeek Harness；如安装在其他位置，请手动确认。\n'
fi
if [ -x '/Applications/Claude Science.app/Contents/Resources/bin/claude-science' ]; then
  printf 'Claude Science 官方应用：已找到\n'
else
  printf '请从 https://claude.com/product/claude-science 安装 Claude Science 到“应用程序”文件夹。\n'
  missing=1
fi
printf '\n在 DSH 的「插件 → 添加插件 → 安装第三方插件」中输入以下本地目录：\n%s\n' "$project_dir"
printf '安装后选择 Claude Science → 模型设置，选择服务并填写对应的 API Key。\n'
exit "$missing"
