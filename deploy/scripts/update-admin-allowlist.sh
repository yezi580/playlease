#!/usr/bin/env bash
# 管理后台 IP 白名单一键更新：检测本机当前公网 IPv4 / IPv6 前缀，
# 更新服务器上的 admin-allowlist 配置并重载 nginx。
#
# 什么时候跑：进不了管理后台（403 被拒）时，说明家里/办公网络的公网 IP 变了，跑一次本脚本即可。
#
# 用法（项目根目录，Git Bash / 或让 Claude 代跑）：
#   bash deploy/scripts/update-admin-allowlist.sh
#
# 可用环境变量覆盖默认值：SSH_KEY、SERVER
set -euo pipefail

SSH_KEY="${SSH_KEY:-D:/pic/only_key.pem}"
SERVER="${SERVER:-root@49.235.59.19}"
REMOTE_FILE="/opt/my-app/deploy/nginx/admin-allowlist.prod.conf"

echo "==> 1/3 检测本机公网 IP"
IPV4=""
for endpoint in ip.3322.net cip.cc; do
  IPV4="$(curl -s --max-time 8 "$endpoint" 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)"
  [ -n "$IPV4" ] && break
done
[ -n "$IPV4" ] || { echo "未能检测到公网 IPv4（检查本机网络）" >&2; exit 1; }
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

echo "==> 2/3 更新服务器白名单并校验配置"
V6_LINE=""
[ -n "$IPV6_PREFIX" ] && V6_LINE="allow ${IPV6_PREFIX};"
ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER" "cat > ${REMOTE_FILE}.new <<EOF
# 由 update-admin-allowlist.sh 自动生成，手工修改会被下次执行覆盖
allow 127.0.0.1;
allow ::1;
allow ${IPV4};
${V6_LINE}
deny all;
EOF
cp ${REMOTE_FILE} ${REMOTE_FILE}.bak 2>/dev/null || true
cat ${REMOTE_FILE}.new > ${REMOTE_FILE} && rm -f ${REMOTE_FILE}.new
cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml exec -T nginx nginx -t" || {
  echo "nginx 配置校验失败，正在回滚" >&2
  ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER" "cp ${REMOTE_FILE}.bak ${REMOTE_FILE} 2>/dev/null || true; cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml exec -T nginx nginx -t" || true
  ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER" "cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml up -d --force-recreate nginx"
  exit 1
}

echo "==> 3/3 重建 nginx 容器使挂载文件生效"
ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER" "cd /opt/my-app && docker compose --env-file deploy/env/prod.env -f deploy/compose/docker-compose.prod.yml up -d --force-recreate nginx 2>&1 | tail -2"

echo "完成。管理后台已放行当前网络：${IPV4}${IPV6_PREFIX:+ / ${IPV6_PREFIX}}"
