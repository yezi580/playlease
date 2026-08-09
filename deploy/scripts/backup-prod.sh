#!/usr/bin/env bash
# 备份生产环境 MySQL 数据库和上传文件
# 本地保留 LOCAL_RETENTION_DAYS 天用于快速恢复, COS 保留 COS_RETENTION_DAYS 天作为兜底
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/compose/docker-compose.prod.yml"

BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/my-app}"
MYSQL_BACKUP_DIR="${BACKUP_ROOT}/mysql"
UPLOADS_BACKUP_DIR="${BACKUP_ROOT}/uploads"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-3}"
COS_RETENTION_DAYS="${COS_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%F_%H%M%S)"
COS_BACKUP_PREFIX="${COS_BACKUP_PREFIX:-backups}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

read_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "${ENV_FILE}" | head -n 1 | cut -d= -f2- || true)"
  [ -n "${value}" ] || fail "Missing ${key} in ${ENV_FILE}"
  printf '%s' "${value}"
}

require_command docker
require_command gzip
require_command tar
require_command find
require_command grep
require_command cut

# coscmd 是可选的，缺失时跳过 COS 上传但不影响本地备份和清理
COSCMD_AVAILABLE=0
if command -v coscmd >/dev/null 2>&1; then
  COSCMD_AVAILABLE=1
fi

[ -f "${ENV_FILE}" ] || fail "Environment file not found: ${ENV_FILE}"
[ -f "${COMPOSE_FILE}" ] || fail "Compose file not found: ${COMPOSE_FILE}"

# 验证保留天数
for var_name in LOCAL_RETENTION_DAYS COS_RETENTION_DAYS; do
  var_value="${!var_name}"
  case "${var_value}" in
    ''|*[!0-9]*)
      fail "${var_name} must be a positive integer"
      ;;
  esac
  if [ "${var_value}" -lt 1 ]; then
    fail "${var_name} must be at least 1"
  fi
done

DB_PASSWORD="$(read_env_value DB_PASSWORD)"
DB_NAME="$(read_env_value DB_NAME)"
UPLOADS_DIR="${PROJECT_ROOT}/server/uploads"

mkdir -p "${MYSQL_BACKUP_DIR}" "${UPLOADS_BACKUP_DIR}"
[ -d "${UPLOADS_DIR}" ] || fail "Uploads directory not found: ${UPLOADS_DIR}"

MYSQL_BACKUP_FILE="${MYSQL_BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP_FILE="${UPLOADS_BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"

log "Starting backup"
log "Backup root: ${BACKUP_ROOT}"
log "Local retention: ${LOCAL_RETENTION_DAYS} days"
log "COS retention: ${COS_RETENTION_DAYS} days"

# --- 1. 备份 MySQL ---
log "Backing up MySQL database ${DB_NAME}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T mysql \
  mysqldump -uroot -p"${DB_PASSWORD}" --single-transaction --quick "${DB_NAME}" \
  | gzip > "${MYSQL_BACKUP_FILE}"

# --- 2. 备份 uploads ---
log "Backing up uploads directory"
tar -czf "${UPLOADS_BACKUP_FILE}" -C "${PROJECT_ROOT}/server" uploads

# --- 3. 清理本地过期备份（先清理，避免 COS 不可用时旧备份堆积） ---
log "Removing expired local backups (older than ${LOCAL_RETENTION_DAYS} days)"
find "${MYSQL_BACKUP_DIR}" -type f -name 'db_*.sql.gz' -mtime +"$((LOCAL_RETENTION_DAYS - 1))" -delete
find "${UPLOADS_BACKUP_DIR}" -type f -name 'uploads_*.tar.gz' -mtime +"$((LOCAL_RETENTION_DAYS - 1))" -delete

# --- 4. 上传备份到 COS（coscmd 不可用时跳过，不影响本地备份） ---
if [ "${COSCMD_AVAILABLE}" -eq 0 ]; then
  log "WARNING: coscmd not found, skipping COS upload (local backups still available)"
else
  COS_SECRET_ID="$(read_env_value COS_SECRET_ID)"
  COS_SECRET_KEY="$(read_env_value COS_SECRET_KEY)"
  COS_BUCKET="$(read_env_value COS_BUCKET)"
  COS_REGION="$(read_env_value COS_REGION)"

  coscmd config -a "${COS_SECRET_ID}" -s "${COS_SECRET_KEY}" -b "${COS_BUCKET}" -r "${COS_REGION}" >/dev/null 2>&1

  COS_MYSQL_KEY="${COS_BACKUP_PREFIX}/mysql/$(basename "${MYSQL_BACKUP_FILE}")"
  log "Uploading MySQL backup to COS: ${COS_MYSQL_KEY}"
  if coscmd upload "${MYSQL_BACKUP_FILE}" "${COS_MYSQL_KEY}" >/dev/null 2>&1; then
    log "MySQL backup uploaded to COS OK"
  else
    log "WARNING: Failed to upload MySQL backup to COS (local backup still available)"
  fi

  COS_UPLOADS_KEY="${COS_BACKUP_PREFIX}/uploads/$(basename "${UPLOADS_BACKUP_FILE}")"
  log "Uploading uploads backup to COS: ${COS_UPLOADS_KEY}"
  if coscmd upload "${UPLOADS_BACKUP_FILE}" "${COS_UPLOADS_KEY}" >/dev/null 2>&1; then
    log "Uploads backup uploaded to COS OK"
  else
    log "WARNING: Failed to upload uploads backup to COS (local backup still available)"
  fi

  # --- 5. 清理 COS 过期备份 ---
  log "Removing expired COS backups (older than ${COS_RETENTION_DAYS} days)"
  CUTOFF_DATE="$(date -d "-${COS_RETENTION_DAYS} days" +%F)"

  for sub_dir in mysql uploads; do
    coscmd list "${COS_BACKUP_PREFIX}/${sub_dir}/" 2>/dev/null | awk '{print $NF}' | while read -r file_key; do
      [ -z "${file_key}" ] && continue
      [ "${file_key}" = "Key" ] && continue

      file_date="$(echo "${file_key}" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)"
      [ -z "${file_date}" ] && continue

      if [[ "${file_date}" < "${CUTOFF_DATE}" ]]; then
        log "Deleting expired COS backup: ${file_key}"
        coscmd delete "${file_key}" >/dev/null 2>&1 || true
      fi
    done
  done
fi

log "Backup finished"
log "MySQL backup: ${MYSQL_BACKUP_FILE}"
log "Uploads backup: ${UPLOADS_BACKUP_FILE}"
