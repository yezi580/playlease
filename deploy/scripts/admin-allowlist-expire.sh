#!/bin/bash
# 管理后台白名单条目 30 天自动失效（服务器侧脚本）。
# 由 update-admin-allowlist.sh 自动 scp 到服务器并注册为每日 cron；
# 也可手动执行：bash /opt/my-app/deploy/scripts/admin-allowlist-expire.sh
#
# 做的事：把 extra.list 里加白超过 30 天的条目移除，并在不动属主 IP 的
# 前提下（属主 allow 行快照在 own.conf 里）重建白名单、校验、重建 nginx。
# 没有过期条目时静默退出，不产生 cron 日志噪音。
set -euo pipefail

BASE="/opt/my-app/deploy/nginx"
EXTRA_LIST="${BASE}/admin-allowlist.extra.list"
OWN_FILE="${BASE}/admin-allowlist.own.conf"
ALLOWLIST="${BASE}/admin-allowlist.prod.conf"
EXPIRE_DAYS=30

compose() {
  cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml "$@"
}

# 属主快照不存在说明还没跑过 update 脚本，不动任何东西
[ -f "$OWN_FILE" ] || exit 0

CUTOFF="$(date -d "${EXPIRE_DAYS} days ago" +%F)"

KEPT=""
EXPIRED=""
if [ -f "$EXTRA_LIST" ]; then
  while IFS='|' read -r ip added _; do
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    if [ -z "$ip" ]; then
      continue
    fi
    added="$(printf '%s' "$added" | tr -d '[:space:]')"
    if ! [[ "$added" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      added="$(date +%F)"   # 无日期的旧行视为今天刚加
    fi
    if [[ "$added" < "$CUTOFF" ]]; then
      EXPIRED="${EXPIRED} ${ip}(${added})"
    else
      KEPT="${KEPT}${ip}|${added}\n"
    fi
  done < "$EXTRA_LIST"
fi

# 没有过期条目：静默退出
if [ -z "$EXPIRED" ]; then
  exit 0
fi
echo "[$(date '+%F %T')] 移除过期条目:${EXPIRED}"

printf '%b' "$KEPT" > "${EXTRA_LIST}.tmp"
cat "${EXTRA_LIST}.tmp" > "$EXTRA_LIST"
rm -f "${EXTRA_LIST}.tmp"

{
  echo "# 由 update-admin-allowlist.sh 自动生成，手工修改会被下次执行覆盖"
  echo "# 持久名单用 add / remove 子命令维护"
  cat "$OWN_FILE"
  while IFS='|' read -r ip _; do
    if [ -n "$ip" ]; then
      echo "allow ${ip};"
    fi
  done < "$EXTRA_LIST"
  echo "deny all;"
} > "${ALLOWLIST}.tmp"

cp "$ALLOWLIST" "${ALLOWLIST}.bak" 2>/dev/null || true
cat "${ALLOWLIST}.tmp" > "$ALLOWLIST"
rm -f "${ALLOWLIST}.tmp"

if ! compose exec -T nginx nginx -t; then
  echo "[$(date '+%F %T')] nginx 配置校验失败，回滚白名单" >&2
  cat "${ALLOWLIST}.bak" > "$ALLOWLIST" 2>/dev/null || true
  exit 1
fi

compose up -d --force-recreate nginx >/dev/null 2>&1
echo "[$(date '+%F %T')] 白名单已重建并生效"
