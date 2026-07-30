// 查看生产环境主机的磁盘使用情况

#!/usr/bin/env bash
set -euo pipefail

TARGET_PATH="${1:-/}"
TOP_N="${2:-20}"

case "${TOP_N}" in
  ''|*[!0-9]*)
    echo "Usage: bash deploy/scripts/check-prod-disk-usage.sh [target_path] [top_n]" >&2
    exit 1
    ;;
esac

if [ ! -d "${TARGET_PATH}" ]; then
  echo "Directory not found: ${TARGET_PATH}" >&2
  exit 1
fi

if [ "${TOP_N}" -lt 1 ]; then
  TOP_N=20
fi

echo "== Filesystem Usage =="
df -h --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x overlay
echo

echo "== Top ${TOP_N} Directories Under ${TARGET_PATH} =="
du -xh -d 1 --exclude=/proc --exclude=/sys --exclude=/dev --exclude=/run "${TARGET_PATH}" 2>/dev/null | sort -hr | head -n "${TOP_N}"
