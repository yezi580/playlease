#!/usr/bin/env bash
# 单机蓝绿零停机发布。
#
# 原理：api-blue / api-green 双容器共用镜像 tag（my-app-api:current），
# nginx 的 upstream-backend.conf 控制活跃色（闲置色标 down）。
# 发布 = 构建新镜像 → 只重建「闲置色」→ 等它通过健康检查 → cat > 原地重写
# upstream 文件（保 inode）→ nginx -t 校验 → nginx -s reload（平滑切换）。
# 旧色保持运行：既是热备也是回滚目标（switch 即回滚）。
#
# 用法（在服务器项目根目录 /opt/my-app 执行）：
#   bash deploy/scripts/blue-green-deploy.sh deploy    发布新版本（构建+切换，零停机）
#   bash deploy/scripts/blue-green-deploy.sh switch    手动切换活跃色（回滚入口，不构建）
#   bash deploy/scripts/blue-green-deploy.sh status    查看活跃色与双色健康状态
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/compose/docker-compose.prod.yml"
UPSTREAM_CONF="${PROJECT_ROOT}/deploy/nginx/upstream-backend.conf"
NGINX_SERVICE="nginx"

HEALTH_TIMEOUT_SECONDS=240
POST_FLIP_SETTLE_SECONDS=3

[ -f "${ENV_FILE}" ] || { echo "env 文件不存在: ${ENV_FILE}" >&2; exit 1; }
[ -f "${COMPOSE_FILE}" ] || { echo "compose 文件不存在: ${COMPOSE_FILE}" >&2; exit 1; }

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

# 必须用 cat > 原地重写（保 inode）：bind mount 下 rm+cp / sed -i 会换 inode，
# 运行中的 nginx 容器看不到新内容（与 certs 目录同一陷阱）
write_upstream() {
  local active="${1}"
  local blue_line="server api-blue:3000;"
  local green_line="server api-green:3000;"
  if [ "${active}" = "blue" ]; then
    green_line="server api-green:3000 down;"
  else
    blue_line="server api-blue:3000 down;"
  fi
  cat > "${UPSTREAM_CONF}" <<EOF
# 蓝绿上游（由 deploy/scripts/blue-green-deploy.sh 维护，勿手改）
upstream api_backend {
    ${blue_line}
    ${green_line}
}
EOF
}

ensure_upstream_conf() {
  if [ ! -f "${UPSTREAM_CONF}" ]; then
    echo "==> 未找到 upstream 配置，写入默认状态（blue 活跃）: ${UPSTREAM_CONF}"
    write_upstream "blue"
  fi
}

active_color() {
  local blue_down green_down
  blue_down="$(grep -c 'server api-blue:3000 down' "${UPSTREAM_CONF}" || true)"
  green_down="$(grep -c 'server api-green:3000 down' "${UPSTREAM_CONF}" || true)"
  if [ "${blue_down}" = "0" ] && [ "${green_down}" = "1" ]; then
    echo "blue"
  elif [ "${green_down}" = "0" ] && [ "${blue_down}" = "1" ]; then
    echo "green"
  else
    echo "unknown"
  fi
}

opposite_color() {
  if [ "$1" = "blue" ]; then echo "green"; else echo "blue"; fi
}

service_health() {
  local service="${1}" cid
  cid="$(compose ps -q "${service}")"
  if [ -z "${cid}" ]; then
    echo "missing"
    return
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${cid}"
}

wait_healthy() {
  local service="${1}" waited="0" health
  printf '等待 %s 变为 healthy' "${service}" >&2
  while :; do
    health="$(service_health "${service}")"
    if [ "${health}" = "healthy" ]; then
      echo ' ✓' >&2
      return 0
    fi
    if [ "${health}" = "missing" ]; then
      echo " 容器不存在: ${service}" >&2
      return 1
    fi
    if [ "${waited}" -ge "${HEALTH_TIMEOUT_SECONDS}" ]; then
      echo " 超时（${HEALTH_TIMEOUT_SECONDS}s），当前状态: ${health}" >&2
      return 1
    fi
    sleep 5
    waited=$((waited + 5))
    printf '.' >&2
  done
}

flip_to() {
  local target="${1}"
  local previous_content
  previous_content="$(cat "${UPSTREAM_CONF}")"

  write_upstream "${target}"

  # 校验失败必须把文件回滚成切换前内容：运行中的 nginx 虽不受影响，
  # 但留着坏文件会让后续任何 reload（如白名单更新）一起失败
  if ! compose exec -T "${NGINX_SERVICE}" nginx -t; then
    printf '%s\n' "${previous_content}" > "${UPSTREAM_CONF}"
    echo "nginx 配置校验失败，已回滚 upstream 文件，流量未切换" >&2
    return 1
  fi
  compose exec -T "${NGINX_SERVICE}" nginx -s reload

  # reload 后确认 nginx 仍存活；异常则回滚文件并尽力再 reload 一次
  sleep "${POST_FLIP_SETTLE_SECONDS}"
  local nginx_cid
  nginx_cid="$(compose ps -q "${NGINX_SERVICE}")"
  if [ -z "${nginx_cid}" ] || [ "$(docker inspect -f '{{.State.Running}}' "${nginx_cid}")" != "true" ]; then
    printf '%s\n' "${previous_content}" > "${UPSTREAM_CONF}"
    compose exec -T "${NGINX_SERVICE}" nginx -s reload || true
    echo "reload 后 nginx 异常，已回滚 upstream，请立即人工检查！" >&2
    return 1
  fi
}

cmd_status() {
  ensure_upstream_conf
  echo "活跃色: $(active_color)"
  echo
  compose ps
  echo
  echo "--- upstream 配置 (${UPSTREAM_CONF}) ---"
  grep -E 'server api-' "${UPSTREAM_CONF}"
}

cmd_switch() {
  ensure_upstream_conf
  local active target
  active="$(active_color)"
  if [ "${active}" = "unknown" ]; then
    echo "无法从 ${UPSTREAM_CONF} 判断活跃色，拒绝切换" >&2
    exit 1
  fi
  target="$(opposite_color "${active}")"
  echo "当前活跃: api-${active}，目标: api-${target}"

  if [ "$(service_health "api-${target}")" != "healthy" ]; then
    wait_healthy "api-${target}" || { echo "目标色未就绪，拒绝切换" >&2; exit 1; }
  fi

  flip_to "${target}"
  echo "已切换 → api-${target}（旧色 api-${active} 保持运行，可再次 switch 回滚）"
}

cmd_deploy() {
  ensure_upstream_conf
  local active idle
  active="$(active_color)"
  if [ "${active}" = "unknown" ]; then
    echo "无法从 ${UPSTREAM_CONF} 判断活跃色，拒绝发布" >&2
    exit 1
  fi
  idle="$(opposite_color "${active}")"

  echo "==> 1/4 构建新镜像（tag: my-app-api:current）"
  compose build api-blue

  echo "==> 2/4 重建闲置色 api-${idle}（活跃色 api-${active} 不受影响）"
  compose up -d --no-deps --force-recreate "api-${idle}"

  echo "==> 3/4 健康检查"
  if ! wait_healthy "api-${idle}"; then
    echo "api-${idle} 未就绪，流量保持在 api-${active}，本次发布中止" >&2
    echo "排查: docker compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs --tail 100 api-${idle}" >&2
    exit 1
  fi

  echo "==> 4/4 切换流量 → api-${idle}"
  flip_to "${idle}" || exit 1

  echo
  echo "发布完成：api-${idle} 接流量，api-${active}（上一版本）保持运行作为热备。"
  echo "回滚：bash deploy/scripts/blue-green-deploy.sh switch"
  echo "清理构建残留悬空镜像：docker image prune -f"
}

case "${1:-}" in
  deploy) cmd_deploy ;;
  switch) cmd_switch ;;
  status) cmd_status ;;
  *)
    echo "用法: bash deploy/scripts/blue-green-deploy.sh {deploy|switch|status}" >&2
    echo "  deploy  发布新版本：构建 → 重建闲置色 → 等健康 → 切流量（零停机）" >&2
    echo "  switch  手动切换活跃色（回滚入口，不构建）" >&2
    echo "  status  查看活跃色与双色健康状态" >&2
    exit 1
    ;;
esac
