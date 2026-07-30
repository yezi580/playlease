#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/compose/docker-compose.prod.yml"

BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/my-app}"
MYSQL_BACKUP_DIR="${BACKUP_ROOT}/mysql"
UPLOADS_BACKUP_DIR="${BACKUP_ROOT}/uploads"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%F_%H%M%S)"

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

[ -f "${ENV_FILE}" ] || fail "Environment file not found: ${ENV_FILE}"
[ -f "${COMPOSE_FILE}" ] || fail "Compose file not found: ${COMPOSE_FILE}"

case "${RETENTION_DAYS}" in
  ''|*[!0-9]*)
    fail "RETENTION_DAYS must be a positive integer"
    ;;
esac

if [ "${RETENTION_DAYS}" -lt 1 ]; then
  fail "RETENTION_DAYS must be at least 1"
fi

DB_PASSWORD="$(read_env_value DB_PASSWORD)"
DB_NAME="$(read_env_value DB_NAME)"
UPLOADS_DIR="${PROJECT_ROOT}/server/uploads"

mkdir -p "${MYSQL_BACKUP_DIR}" "${UPLOADS_BACKUP_DIR}"
[ -d "${UPLOADS_DIR}" ] || fail "Uploads directory not found: ${UPLOADS_DIR}"

MYSQL_BACKUP_FILE="${MYSQL_BACKUP_DIR}/db_${TIMESTAMP}.sql.gz"
UPLOADS_BACKUP_FILE="${UPLOADS_BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"

log "Starting backup"
log "Backup root: ${BACKUP_ROOT}"
log "Retention days: ${RETENTION_DAYS}"

log "Backing up MySQL database ${DB_NAME}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T mysql \
  mysqldump -uroot -p"${DB_PASSWORD}" --single-transaction --quick "${DB_NAME}" \
  | gzip > "${MYSQL_BACKUP_FILE}"

log "Backing up uploads directory"
tar -czf "${UPLOADS_BACKUP_FILE}" -C "${PROJECT_ROOT}/server" uploads

log "Removing expired backups"
find "${MYSQL_BACKUP_DIR}" -type f -name 'db_*.sql.gz' -mtime +"$((RETENTION_DAYS - 1))" -delete
find "${UPLOADS_BACKUP_DIR}" -type f -name 'uploads_*.tar.gz' -mtime +"$((RETENTION_DAYS - 1))" -delete

log "Backup finished"
log "MySQL backup: ${MYSQL_BACKUP_FILE}"
log "Uploads backup: ${UPLOADS_BACKUP_FILE}"
