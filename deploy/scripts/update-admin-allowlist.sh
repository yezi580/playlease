#!/usr/bin/env bash
# 管理后台 IP 白名单维护：检测本机当前公网 IPv4 / IPv6 前缀，与服务器上
# 持久保存的「其他管理员 IP 清单」合并生成 admin-allowlist，并重建 nginx。
#
# 子命令：
#   （无参数）          自己的公网 IP 变了、进后台 403 时跑一次
#   add <IP或前缀>      给其他管理员 IP 加白（持久保存，之后更新自己的 IP 不会覆盖它）
#   remove <IP或前缀>   从持久清单移除该条目
#   list                查看持久清单与服务器上当前生效的白名单
#
# 用法（项目根目录，Git Bash / 或让 Claude 代跑）：
#   bash deploy/scripts/update-admin-allowlist.sh
#   bash deploy/scripts/update-admin-allowlist.sh add 1.2.3.4
#   bash deploy/scripts/update-admin-allowlist.sh add 240e:abcd:1234:5678::/64
#   bash deploy/scripts/update-admin-allowlist.sh remove 1.2.3.4
#   bash deploy/scripts/update-admin-allowlist.sh list
#
# 给其他管理员加白：让对方浏览器打开 https://cip.cc 把显示的 IP 发给你，
# 在本机跑 add 子命令即可，对方无需安装任何东西。家庭宽带 IP 会变，
# 对方哪天又 403 了，重发一次 IP 再 add 即可。
#
# 可用环境变量覆盖默认值：SSH_KEY、SERVER
set -euo pipefail

SSH_KEY="${SSH_KEY:-D:/pic/only_key.pem}"
SERVER="${SERVER:-root@49.235.59.19}"
REMOTE_FILE="/opt/my-app/deploy/nginx/admin-allowlist.prod.conf"
# 持久 IP 清单（每行一个 IPv4/IPv6/CIDR）。只存服务器、不进 git（含他人 IP）。
REMOTE_EXTRA="/opt/my-app/deploy/nginx/admin-allowlist.extra.list"

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

case "$ACTION" in
  add | remove)
    [ -n "$ENTRY" ] || fail "用法: bash deploy/scripts/update-admin-allowlist.sh ${ACTION} <IP或前缀>"
    validate_entry "$ENTRY"
    ;;
  update | list) ;;
  *) fail "未知子命令「${ACTION}」。可用：add / remove / list（或不带参数更新自己的 IP）" ;;
esac

if [ "$ACTION" = "list" ]; then
  echo "==> 持久清单（${REMOTE_EXTRA}）"
  fetch_extra | sed 's/^/    /'
  echo "==> 当前生效白名单（${REMOTE_FILE}）"
  ssh "${SSH_OPTS[@]}" "$SERVER" "cat ${REMOTE_FILE} 2>/dev/null" | sed 's/^/    /'
  exit 0
fi

EXTRA_LIST="$(fetch_extra)"
case "$ACTION" in
  add)
    if [ -n "$EXTRA_LIST" ] && printf '%s\n' "$EXTRA_LIST" | grep -qxF "$ENTRY"; then
      echo "==> 「${ENTRY}」已在持久清单中，无需重复添加"
    else
      EXTRA_LIST="${EXTRA_LIST}${EXTRA_LIST:+$'\n'}${ENTRY}"
      echo "==> 持久清单新增：${ENTRY}"
    fi
    ;;
  remove)
    if [ -n "$EXTRA_LIST" ] && printf '%s\n' "$EXTRA_LIST" | grep -qxF "$ENTRY"; then
      EXTRA_LIST="$(printf '%s\n' "$EXTRA_LIST" | grep -vxF "$ENTRY")"
      echo "==> 持久清单移除：${ENTRY}"
    else
      echo "==> 持久清单中没有「${ENTRY}」，无需移除"
    fi
    ;;
esac

echo "==> 1/3 检测本机公网 IP"
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

CONFIG="# 由 update-admin-allowlist.sh 自动生成，手工修改会被下次执行覆盖
# 持久名单用 add / remove 子命令维护
allow 127.0.0.1;
allow ::1;
allow ${IPV4};
"
[ -n "$IPV6_PREFIX" ] && CONFIG="${CONFIG}allow ${IPV6_PREFIX};"$'\n'
if [ -n "$EXTRA_LIST" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    CONFIG="${CONFIG}allow ${line};"$'\n'
  done <<< "$EXTRA_LIST"
fi
CONFIG="${CONFIG}deny all;"$'\n'

echo "==> 2/3 写入白名单并校验配置"
printf '%s' "$CONFIG" | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > ${REMOTE_FILE}.new"
printf '%s' "$EXTRA_LIST" | ssh "${SSH_OPTS[@]}" "$SERVER" "cat > ${REMOTE_EXTRA}"

ssh "${SSH_OPTS[@]}" "$SERVER" "cp ${REMOTE_FILE} ${REMOTE_FILE}.bak 2>/dev/null || true
cat ${REMOTE_FILE}.new > ${REMOTE_FILE} && rm -f ${REMOTE_FILE}.new
${COMPOSE} exec -T nginx nginx -t" || {
  echo "nginx 配置校验失败，正在回滚" >&2
  ssh "${SSH_OPTS[@]}" "$SERVER" "cp ${REMOTE_FILE}.bak ${REMOTE_FILE} 2>/dev/null || true; ${COMPOSE} exec -T nginx nginx -t" || true
  ssh "${SSH_OPTS[@]}" "$SERVER" "${COMPOSE} up -d --force-recreate nginx"
  exit 1
}

echo "==> 3/3 重建 nginx 容器使挂载文件生效"
ssh "${SSH_OPTS[@]}" "$SERVER" "${COMPOSE} up -d --force-recreate nginx 2>&1 | tail -2"

echo "完成。当前放行：127.0.0.1 / ${IPV4}${IPV6_PREFIX:+ / ${IPV6_PREFIX}}${EXTRA_LIST:+ / $(printf '%s' "$EXTRA_LIST" | tr '\n' ' ')}"
