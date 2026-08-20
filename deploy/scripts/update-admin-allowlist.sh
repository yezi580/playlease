#!/usr/bin/env bash
# 管理后台 IP 白名单维护：检测本机当前公网 IPv4 / IPv6 前缀，与服务器上
# 持久保存的「其他管理员 IP 清单」合并生成 admin-allowlist，并重建 nginx。
#
# 子命令：
#   （无参数）          自己的公网 IP 变了、进后台 403 时跑一次
#   add <IP或前缀>      给其他管理员 IP 加白；30 天自动失效，重复 add 即续期
#   remove <IP或前缀>   立即移除指定条目
#   list                查看持久清单（含剩余天数）与当前生效的白名单
#
# 用法（项目根目录，Git Bash / 或让 Claude 代跑）：
#   bash deploy/scripts/update-admin-allowlist.sh
#   bash deploy/scripts/update-admin-allowlist.sh add 1.2.3.4
#   bash deploy/scripts/update-admin-allowlist.sh add 240e:abcd:1234:5678::/64
#   bash deploy/scripts/update-admin-allowlist.sh remove 1.2.3.4
#   bash deploy/scripts/update-admin-allowlist.sh list
#
# 给其他管理员加白：让对方浏览器打开 https://cip.cc 把显示的 IP 发给你，
# 在本机跑 add 子命令即可，对方无需安装任何东西。家庭宽带 IP 会变，对方
# 又 403 了就重发一次 IP 再 add（同一 IP 重复 add 会刷新 30 天有效期）。
#
# 失效机制：条目以「IP|加白日期」存在服务器 extra.list，超过 30 天自动
# 移除（避免运营商把旧 IP 重新分配给陌生人后仍留在白名单里）。由服务器
# 每日 cron（admin-allowlist-expire.sh，本脚本自动部署并注册）清理，
# 本脚本每次运行时也会顺带清理。
#
# 可用环境变量覆盖默认值：SSH_KEY、SERVER
set -euo pipefail

SSH_KEY="${SSH_KEY:-D:/pic/only_key.pem}"
SERVER="${SERVER:-root@49.235.59.19}"
REMOTE_FILE="/opt/my-app/deploy/nginx/admin-allowlist.prod.conf"
# 持久 IP 清单，每行「IP|加白日期」。只存服务器、不进 git（含他人 IP）。
REMOTE_EXTRA="/opt/my-app/deploy/nginx/admin-allowlist.extra.list"
# 属主（本机）allow 行快照，供服务器 cron 在不动属主 IP 的前提下重建白名单
REMOTE_OWN="/opt/my-app/deploy/nginx/admin-allowlist.own.conf"
EXPIRE_DAYS=30

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes)
COMPOSE="cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml"

fail() { echo "$1" >&2; exit 1; }

validate_entry() {
  local entry="$1"
  [[ "$entry" =~ ^[0-9a-fA-F.:/]+$ ]] || fail "非法条目「${entry}」：仅允许 IPv4 / IPv6 / CIDR 前缀"
  if [[ "$entry" != *:* ]]; then
    [[ "$entry" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ ]] || fail "非法条目「${entry}」：不是合法的 IPv4 / CIDR"
  fi
}

fetch_extra() {
  ssh "${SSH_OPTS[@]}" "$SERVER" "cat ${REMOTE_EXTRA} 2>/dev/null" | grep -v '^[[:space:]]*$' || true
}

ACTION="${1:-update}"
ENTRY="$(printf '%s' "${2:-}" | tr 'A-F' 'a-f' | tr -d '[:space:]')"
TODAY="$(date +%F)"
CUTOFF="$(date -d "${EXPIRE_DAYS} days ago" +%F)"

case "$ACTION" in
  add | remove)
    [ -n "$ENTRY" ] || fail "用法: bash deploy/scripts/update-admin-allowlist.sh ${ACTION} <IP或前缀>"
    validate_entry "$ENTRY"
    ;;
  update | list) ;;
  *) fail "未知子命令「${ACTION}」。可用：add / remove / list（或不带参数更新自己的 IP）" ;;
esac

if [ "$ACTION" = "list" ]; then
  echo "==> 持久清单（${REMOTE_EXTRA}，${EXPIRE_DAYS} 天自动失效）"
  RAW="$(fetch_extra)"
  if [ -n "$RAW" ]; then
    while IFS='|' read -r ip added _; do
      ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
      [ -n "$ip" ] || continue
      added="$(printf '%s' "$added" | tr -d '[:space:]')"
      [[ "$added" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || added="$TODAY"
      if [[ "$added" < "$CUTOFF" ]]; then
        echo "    ${ip}  已过期（${added} 加白），待 cron / 下次脚本运行移除"
      else
        remain=$(( ( $(date -d "$TODAY" +%s) - $(date -d "$added" +%s) ) / 86400 ))
        echo "    ${ip}  剩余 $((EXPIRE_DAYS - remain)) 天（${added} 加白）"
      fi
    done <<< "$RAW"
  else
    echo "    （空）"
  fi
  echo "==> 当前生效白名单（${REMOTE_FILE}）"
  ssh "${SSH_OPTS[@]}" "$SERVER" "cat ${REMOTE_FILE} 2>/dev/null" | sed 's/^/    /'
  echo "==> 自动失效 cron"
  ssh "${SSH_OPTS[@]}" "$SERVER" "crontab -l 2>/dev/null | grep 'admin-allowlist-expire'" || true
  exit 0
fi

# 读回清单并规范化：无日期行视为今天，过期行剔除
EXTRA_NORMALIZED=""
DROPPED=""
RAW="$(fetch_extra)"
if [ -n "$RAW" ]; then
  while IFS='|' read -r ip added _; do
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    [ -n "$ip" ] || continue
    added="$(printf '%s' "$added" | tr -d '[:space:]')"
    [[ "$added" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || added="$TODAY"
    if [[ "$added" < "$CUTOFF" ]]; then
      DROPPED="${DROPPED} ${ip}"
    else
      EXTRA_NORMALIZED="${EXTRA_NORMALIZED}${ip}|${added}\n"
    fi
  done <<< "$RAW"
fi
if [ -n "$DROPPED" ]; then
  echo "==> 以下条目已超 ${EXPIRE_DAYS} 天，自动移除:${DROPPED}"
fi

case "$ACTION" in
  add)
    EXISTS=0
    NEW_LIST=""
    while IFS='|' read -r ip added _; do
      [ -n "$ip" ] || continue
      if [ "$ip" = "$ENTRY" ]; then
        EXISTS=1
        added="$TODAY"
      fi
      NEW_LIST="${NEW_LIST}${ip}|${added}\n"
    done <<< "$(printf '%b' "$EXTRA_NORMALIZED")"
    EXTRA_NORMALIZED="$NEW_LIST"
    if [ "$EXISTS" = "1" ]; then
      echo "==> 「${ENTRY}」已在清单中，有效期已刷新（${TODAY} 起算 ${EXPIRE_DAYS} 天）"
    else
      EXTRA_NORMALIZED="${EXTRA_NORMALIZED}${ENTRY}|${TODAY}\n"
      echo "==> 持久清单新增：${ENTRY}（${EXPIRE_DAYS} 天后自动失效，届时重新 add 续期）"
    fi
    ;;
  remove)
    FOUND=0
    NEW_LIST=""
    while IFS='|' read -r ip added _; do
      [ -n "$ip" ] || continue
      if [ "$ip" = "$ENTRY" ]; then
        FOUND=1
        continue
      fi
      NEW_LIST="${NEW_LIST}${ip}|${added}\n"
    done <<< "$(printf '%b' "$EXTRA_NORMALIZED")"
    EXTRA_NORMALIZED="$NEW_LIST"
    if [ "$FOUND" = "1" ]; then
      echo "==> 持久清单移除：${ENTRY}"
    else
      echo "==> 持久清单中没有「${ENTRY}」，无需移除"
    fi
    ;;
esac

echo "==> 1/4 检测本机公网 IP"
IPV4=""
for endpoint in ip.3322.net cip.cc; do
  IPV4="$(curl -s --max-time 8 "$endpoint" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)"
  [ -n "$IPV4" ] && break
done
[ -n "$IPV4" ] || fail "未能检测到公网 IPv4（检查本机网络）"
echo "    IPv4: ${IPV4}"

IPV6_FULL=""
for endpoint in 6.ipw.cn myip.ipip.net; do
  IPV6_FULL="$(curl -6 -s --max-time 8 "$endpoint" 2>/dev/null | grep -oE '([0-9a-fA-F]{0,4}:){4,7}[0-9a-fA-F]{0,4}' | head -1 || true)"
  [ -n "$IPV6_FULL" ] && break
done
IPV6_PREFIX=""
if [ -n "$IPV6_FULL" ]; then
  IPV6_PREFIX="$(printf '%s' "$IPV6_FULL" | cut -d: -f1-4)::/64"
  echo "    IPv6 前缀: ${IPV6_PREFIX}"
else
  echo "    未检测到 IPv6，跳过"
fi

OWN_CONF="allow 127.0.0.1;
allow ::1;
allow ${IPV4};
"
[ -n "$IPV6_PREFIX" ] && OWN_CONF="${OWN_CONF}allow ${IPV6_PREFIX};"$'\n'

CONFIG="# 由 update-admin-allowlist.sh 自动生成，手工修改会被下次执行覆盖
# 持久名单用 add / remove 子命令维护
${OWN_CONF}"
if [ -n "$EXTRA_NORMALIZED" ]; then
  while IFS='|' read -r ip _; do
    [ -n "$ip" ] || continue
    CONFIG="${CONFIG}allow ${ip};"$'\n'
  done <<< "$(printf '%b' "$EXTRA_NORMALIZED")"
fi
CONFIG="${CONFIG}deny all;"$'\n'

echo "==> 2/4 写入白名单并校验配置"
printf '%s' "$CONFIG" | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > ${REMOTE_FILE}.new"
printf '%b' "$EXTRA_NORMALIZED" | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > ${REMOTE_EXTRA}"
printf '%s' "$OWN_CONF" | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > ${REMOTE_OWN}"

ssh "${SSH_OPTS[@]}" "$SERVER" "cp ${REMOTE_FILE} ${REMOTE_FILE}.bak 2>/dev/null || true
cat ${REMOTE_FILE}.new > ${REMOTE_FILE} && rm -f ${REMOTE_FILE}.new
${COMPOSE} exec -T nginx nginx -t" || {
  echo "nginx 配置校验失败，正在回滚" >&2
  ssh "${SSH_OPTS[@]}" "$SERVER" "cp ${REMOTE_FILE}.bak ${REMOTE_FILE} 2>/dev/null || true; ${COMPOSE} exec -T nginx nginx -t" || true
  ssh "${SSH_OPTS[@]}" "$SERVER" "${COMPOSE} up -d --force-recreate nginx"
  exit 1
}

echo "==> 3/4 重建 nginx 容器使挂载文件生效"
ssh "${SSH_OPTS[@]}" "$SERVER" "${COMPOSE} up -d --force-recreate nginx 2>&1 | tail -2"

echo "==> 4/4 部署 ${EXPIRE_DAYS} 天自动失效 cron"
if scp -q -i "$SSH_KEY" -o BatchMode=yes "$(dirname "$0")/admin-allowlist-expire.sh" "${SERVER}:/opt/my-app/deploy/scripts/admin-allowlist-expire.sh" 2>/dev/null \
  && ssh "${SSH_OPTS[@]}" "$SERVER" "crontab -l 2>/dev/null | grep -v 'admin-allowlist-expire' | { cat; echo '17 4 * * * /bin/bash /opt/my-app/deploy/scripts/admin-allowlist-expire.sh >> /opt/my-app/deploy/nginx/allowlist-expire.log 2>&1 # admin-allowlist-expire'; } | crontab -"; then
  echo "    每日 04:17 自动清理过期条目（日志：/opt/my-app/deploy/nginx/allowlist-expire.log）"
else
  echo "    cron 注册失败（不影响本次加白），下次运行会重试" >&2
fi

echo "完成。当前放行：127.0.0.1 / ${IPV4}${IPV6_PREFIX:+ / ${IPV6_PREFIX}}${EXTRA_NORMALIZED:+ / $(printf '%b' "$EXTRA_NORMALIZED" | cut -d'|' -f1 | tr '\n' ' ')}（持久名单 ${EXPIRE_DAYS} 天自动失效）"
