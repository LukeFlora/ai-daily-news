#!/bin/bash

# ==============================================================================
# setup-schedule.sh - 配置 macOS 工作日定时任务 (周一至周五 09:00)
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(which node)"
PLIST_NAME="com.aibuilders.digest.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$LAUNCH_AGENTS_DIR/$PLIST_NAME"

echo "=== 配置 AI Builders 日报定时服务 (工作日 09:00) ==="
echo "项目路径: $PROJECT_DIR"
echo "Node 路径: $NODE_PATH"

mkdir -p "$LAUNCH_AGENTS_DIR"

# 动态替换实际的 Node 与 项目绝对路径
sed -e "s|/usr/local/bin/node|$NODE_PATH|g" \
    -e "s|/Users/design/Documents/Antigravity/每日AI新闻收集|$PROJECT_DIR|g" \
    "$PROJECT_DIR/scripts/com.aibuilders.digest.plist" > "$TARGET_PLIST"

# 卸载旧任务并注册新任务
launchctl unload "$TARGET_PLIST" 2>/dev/null || true
launchctl load "$TARGET_PLIST"

echo "✅ [配置成功] macOS launchd 服务已启动！"
echo "服务文件: $TARGET_PLIST"
echo "触发规则: 每周一、二、三、四、五 早晨 09:00 自动运行。"
echo ""
echo "如需卸载此定时任务，请执行："
echo "launchctl unload $TARGET_PLIST && rm $TARGET_PLIST"
