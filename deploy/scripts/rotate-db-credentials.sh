#!/usr/bin/env bash
# 轮换数据库凭据并启用最小权限业务账号（一次性完成 SQL 轮换 + env 更新 + 容器重建）。
#
# 做了什么：
#   1. 用 prod.env 里的旧密码连入 MySQL，执行：
#      - ALTER USER root（'%' 与 'localhost'）→ 新 root 密码
#      - CREATE USER 'app_rw'（已存在则改密码）→ 应用专用账号
#      - GRANT SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/DROP/REFERENCES ON <库>.* TO 'app_rw'
#        （REFERENCES 供启动迁移里的外键约束使用，缺了会导致 api 启动崩溃）
#        （无 mysql.* 访问、无 GRANT、无 FILE/SUPER 等全局权限，爆炸半径限制在业务库内）
#   2. 更新 deploy/env/prod.env：DB_PASSWORD=新应用密码、DB_USER=app_rw、DB_ROOT_PASSWORD=新 root 密码
#   3. docker compose up -d mysql api（用新凭据重建容器）
#   4. 用 app_rw 验证连接
#
# 用法（在生产服务器项目根目录执行）：
#   bash deploy/scripts/rotate-db-credentials.sh                     # 手动输入两个新密码（不回显、不进历史）
#   bash deploy/scripts/rotate-db-credentials.sh --generate          # 服务器端随机生成，跑完打印一次（保存到密码管理器）
#   bash deploy/scripts/rotate-db-credentials.sh --generate --no-print # 同上，但不回显；
#                                                                     # 凭据写入 /root/my-app-db-credentials.txt（权限 600）
#
# 任何模式都不要把密码粘贴到聊天工具/工单/代码里——它们不属于任何第三方。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/compose/docker-compose.prod.yml"

APP_DB_USER="app_rw"
DB_NAME_DEFAULT="game_rental"

[ -f "${ENV_FILE}" ] || { echo "Environment file not found: ${ENV_FILE}" >&2; exit 1; }
[ -f "${COMPOSE_FILE}" ] || { echo "Compose file not found: ${COMPOSE_FILE}" >&2; exit 1; }

read_env_value() {
  local key="$1" line
  line="$(grep -m 1 "^${key}=" "${ENV_FILE}" || true)"
  printf '%s' "${line#*=}"
}

upsert_env_value() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

OLD_ROOT_PASSWORD="$(read_env_value DB_PASSWORD)"
DB_NAME="$(read_env_value DB_NAME)"
DB_NAME="${DB_NAME:-${DB_NAME_DEFAULT}}"

[ -n "${OLD_ROOT_PASSWORD}" ] || { echo "DB_PASSWORD is missing in ${ENV_FILE}" >&2; exit 1; }
[[ "${DB_NAME}" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Invalid DB_NAME: ${DB_NAME}" >&2; exit 1; }

# 仅允许 base64 类字符集：可安全嵌入 SQL 单引号字符串、sed 替换与 env 文件
is_valid_password() {
  [[ "$1" =~ ^[A-Za-z0-9+/_=-]{16,128}$ ]]
}

prompt_password() {
  local label="$1" var_name="$2" once="" twice=""
  read -r -s -p "请输入${label}（openssl rand -base64 24 生成，输入不回显）: " once
  echo >&2
  read -r -s -p "再次输入${label}确认: " twice
  echo >&2
  [ "${once}" = "${twice}" ] || { echo "两次输入不一致" >&2; exit 1; }
  is_valid_password "${once}" || {
    echo "${label}不合法：需 16-128 位，仅限字母/数字/+ / _ = -（避免引号等特殊字符）" >&2
    exit 1
  }
  printf -v "${var_name}" '%s' "${once}"
}

MODE="${1:-}"
NO_PRINT="${2:-}"
case "${NO_PRINT}" in ""|--no-print) ;; *) echo "未知参数: ${NO_PRINT}（仅支持 --no-print）" >&2; exit 1 ;; esac

if [ "${MODE}" = "--generate" ]; then
  # 服务器端随机生成：密码不经过人工输入、命令行参数或任何聊天通道
  command -v openssl >/dev/null 2>&1 || { echo "服务器缺少 openssl，无法自动生成密码" >&2; exit 1; }
  NEW_ROOT_PASSWORD="$(openssl rand -base64 24)"
  NEW_APP_PASSWORD="$(openssl rand -base64 24)"
  while [ "${NEW_ROOT_PASSWORD}" = "${NEW_APP_PASSWORD}" ]; do
    NEW_APP_PASSWORD="$(openssl rand -base64 24)"
  done
elif [ -z "${MODE}" ]; then
  prompt_password "新 root 密码" NEW_ROOT_PASSWORD
  prompt_password "新 ${APP_DB_USER} 应用账号密码" NEW_APP_PASSWORD
else
  echo "未知参数: ${MODE}（仅支持 --generate）" >&2
  exit 1
fi

is_valid_password "${NEW_ROOT_PASSWORD}" || { echo "root 密码不合法" >&2; exit 1; }
is_valid_password "${NEW_APP_PASSWORD}" || { echo "应用账号密码不合法" >&2; exit 1; }
[ "${NEW_ROOT_PASSWORD}" != "${NEW_APP_PASSWORD}" ] || {
  echo "root 与应用账号不能使用同一密码" >&2
  exit 1
}

echo "==> 1/4 在 MySQL 内轮换凭据（root 改密 + 创建 ${APP_DB_USER} 并授权）"
# 密码通过 MYSQL_PWD 环境变量传入，不进进程参数；SQL 走 stdin
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
  -e MYSQL_PWD="${OLD_ROOT_PASSWORD}" mysql \
  mysql -uroot "${DB_NAME}" <<SQL
ALTER USER 'root'@'%' IDENTIFIED BY '${NEW_ROOT_PASSWORD}';
ALTER USER 'root'@'localhost' IDENTIFIED BY '${NEW_ROOT_PASSWORD}';
CREATE USER IF NOT EXISTS '${APP_DB_USER}'@'%' IDENTIFIED BY '${NEW_APP_PASSWORD}';
ALTER USER '${APP_DB_USER}'@'%' IDENTIFIED BY '${NEW_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON \`${DB_NAME}\`.* TO '${APP_DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "==> 2/4 更新 ${ENV_FILE}"
upsert_env_value "DB_PASSWORD" "${NEW_APP_PASSWORD}"
upsert_env_value "DB_USER" "${APP_DB_USER}"
upsert_env_value "DB_ROOT_PASSWORD" "${NEW_ROOT_PASSWORD}"
chmod 600 "${ENV_FILE}"

echo "==> 3/4 重建 mysql / api 容器（短暂中断，健康检查通过后自动恢复）"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d mysql api

echo "==> 4/4 验证 ${APP_DB_USER} 连接"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
  -e MYSQL_PWD="${NEW_APP_PASSWORD}" mysql \
  mysql -u"${APP_DB_USER}" "${DB_NAME}" -e "SELECT CURRENT_USER() AS connected_as;"

echo "完成。当前生效：root 已轮换，应用以 ${APP_DB_USER}（仅 ${DB_NAME} 库的表级权限）连接。"
echo "提醒：旧密码已进过 git 历史，视同公开；本机的 deploy/env/dev.env、test.env 若沿用旧值请一并更换。"

if [ "${MODE}" = "--generate" ]; then
  # 凭据落盘到 root-only 文件；--no-print 时不在终端回显（供自动化/远程执行使用）
  CREDENTIALS_FILE="/root/my-app-db-credentials.txt"
  {
    echo "# 由 rotate-db-credentials.sh 生成于 $(date '+%F %T')"
    echo "MySQL root 新密码      : ${NEW_ROOT_PASSWORD}"
    echo "MySQL ${APP_DB_USER} 应用账号密码 : ${NEW_APP_PASSWORD}"
    echo "（两份密码也已写入 ${ENV_FILE}，文件权限 600）"
  } > "${CREDENTIALS_FILE}"
  chmod 600 "${CREDENTIALS_FILE}"
  if [ "${NO_PRINT}" = "--no-print" ]; then
    echo "新凭据已写入 ${CREDENTIALS_FILE}（权限 600），未在终端回显。"
  else
    echo ""
    echo "====== 请立即保存以下新凭据（仅此一次展示，请存入密码管理器）======"
    cat "${CREDENTIALS_FILE}"
    echo "=================================================================="
  fi
fi
