// 查看生产环境 MySQL 当前配置和连接状态

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/opt/my-app}"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-my-app-prod-mysql-1}"

[ -f "${ENV_FILE}" ] || {
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
}

DB_PASSWORD="$(grep '^DB_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"
[ -n "${DB_PASSWORD}" ] || {
  echo "DB_PASSWORD is missing in ${ENV_FILE}" >&2
  exit 1
}

docker exec -i "${MYSQL_CONTAINER}" mysql -uroot -p"${DB_PASSWORD}" <<'SQL'
SHOW VARIABLES WHERE Variable_name IN ('slow_query_log','long_query_time','min_examined_row_limit','max_connections','performance_schema','log_output');
SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections');
SQL
