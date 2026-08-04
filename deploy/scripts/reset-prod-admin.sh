#!/usr/bin/env bash
set -euo pipefail

OLD_PHONE="${1:-}"
NEW_PHONE="${2:-}"
NEW_PASSWORD="${3:-}"

usage() {
  echo "Usage: bash deploy/scripts/reset-prod-admin.sh <old_phone> <new_phone> <new_password>" >&2
}

is_valid_phone() {
  [[ "$1" =~ ^1[3-9][0-9]{9}$ ]]
}

if [ -z "${OLD_PHONE}" ] || [ -z "${NEW_PHONE}" ] || [ -z "${NEW_PASSWORD}" ]; then
  usage
  exit 1
fi

if ! is_valid_phone "${OLD_PHONE}"; then
  echo "Invalid old_phone: ${OLD_PHONE}" >&2
  exit 1
fi

if ! is_valid_phone "${NEW_PHONE}"; then
  echo "Invalid new_phone: ${NEW_PHONE}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/deploy/env/prod.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/compose/docker-compose.prod.yml"

[ -f "${ENV_FILE}" ] || {
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
}

[ -f "${COMPOSE_FILE}" ] || {
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
}

read_env_value() {
  local key="$1"
  local line
  line="$(grep -m 1 "^${key}=" "${ENV_FILE}" || true)"
  printf '%s' "${line#*=}"
}

DB_USER="$(read_env_value DB_USER)"
DB_NAME="$(read_env_value DB_NAME)"
DB_PASSWORD="$(read_env_value DB_PASSWORD)"

DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-game_rental}"

[ -n "${DB_PASSWORD}" ] || {
  echo "DB_PASSWORD is missing in ${ENV_FILE}" >&2
  exit 1
}

run_mysql() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T mysql \
    mysql -N -B -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" "$@"
}

OLD_USER_ROW="$(run_mysql -e "SELECT id, phone, role FROM users WHERE phone = '${OLD_PHONE}' LIMIT 1;")"
[ -n "${OLD_USER_ROW}" ] || {
  echo "Admin user with phone ${OLD_PHONE} was not found." >&2
  exit 1
}

TARGET_USER_ID="$(printf '%s\n' "${OLD_USER_ROW}" | awk '{print $1}')"

if [ "${OLD_PHONE}" != "${NEW_PHONE}" ]; then
  CONFLICT_USER_ID="$(run_mysql -e "SELECT id FROM users WHERE phone = '${NEW_PHONE}' LIMIT 1;")"
  if [ -n "${CONFLICT_USER_ID}" ] && [ "${CONFLICT_USER_ID}" != "${TARGET_USER_ID}" ]; then
    echo "Phone ${NEW_PHONE} is already used by another user (id=${CONFLICT_USER_ID})." >&2
    exit 1
  fi
fi

MASKED_USERNAME="${NEW_PHONE:0:3}****${NEW_PHONE:7:4}"

PASSWORD_HASH="$(
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
    -e ADMIN_RESET_PASSWORD="${NEW_PASSWORD}" \
    api node --input-type=module -e "import bcrypt from 'bcryptjs'; const password = process.env.ADMIN_RESET_PASSWORD || ''; if (!password) { console.error('Missing password'); process.exit(1); } console.log(await bcrypt.hash(password, 10));" | tr -d '\r'
)"

[ -n "${PASSWORD_HASH}" ] || {
  echo "Failed to generate password hash in api container." >&2
  exit 1
}

HASH_CHECK_RESULT="$(
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
    -e ADMIN_RESET_PASSWORD="${NEW_PASSWORD}" \
    -e ADMIN_RESET_HASH="${PASSWORD_HASH}" \
    api node --input-type=module -e "import bcrypt from 'bcryptjs'; const password = process.env.ADMIN_RESET_PASSWORD || ''; const hash = process.env.ADMIN_RESET_HASH || ''; if (!password || !hash) { console.error('Missing password/hash'); process.exit(1); } console.log(await bcrypt.compare(password, hash));" | tr -d '\r'
)"

[ "${HASH_CHECK_RESULT}" = "true" ] || {
  echo "Generated password hash verification failed." >&2
  exit 1
}

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T mysql \
  mysql -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" <<SQL
START TRANSACTION;
UPDATE users
SET phone = '${NEW_PHONE}',
    username = '${MASKED_USERNAME}',
    password_hash = '${PASSWORD_HASH}',
    role = 'admin',
    banned_until = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ${TARGET_USER_ID};
DELETE FROM admin_passkeys WHERE user_id = ${TARGET_USER_ID};
DELETE FROM admin_trusted_devices WHERE user_id = ${TARGET_USER_ID};
COMMIT;
SQL

REVOKED_SESSIONS="unknown"
if REVOKED_OUTPUT="$(
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
    -e ADMIN_TARGET_USER_ID="${TARGET_USER_ID}" \
    api node --input-type=module -e "import { revokeAllLoginSessionsByUserId } from './infrastructure/redis.js'; const userId = Number(process.env.ADMIN_TARGET_USER_ID || 0); if (!userId) { console.error('Missing user id'); process.exit(1); } const count = await revokeAllLoginSessionsByUserId(userId); console.log(count);" 2>/dev/null | tr -d '\r'
)"; then
  REVOKED_SESSIONS="${REVOKED_OUTPUT}"
fi

UPDATED_ROW="$(run_mysql -e "SELECT id, phone, username, role FROM users WHERE id = ${TARGET_USER_ID} LIMIT 1;")"
UPDATED_HASH="$(run_mysql -e "SELECT password_hash FROM users WHERE id = ${TARGET_USER_ID} LIMIT 1;")"

UPDATED_HASH_CHECK_RESULT="$(
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T \
    -e ADMIN_RESET_PASSWORD="${NEW_PASSWORD}" \
    -e ADMIN_RESET_HASH="${UPDATED_HASH}" \
    api node --input-type=module -e "import bcrypt from 'bcryptjs'; const password = process.env.ADMIN_RESET_PASSWORD || ''; const hash = process.env.ADMIN_RESET_HASH || ''; if (!password || !hash) { console.error('Missing password/hash'); process.exit(1); } console.log(await bcrypt.compare(password, hash));" | tr -d '\r'
)"

[ "${UPDATED_HASH_CHECK_RESULT}" = "true" ] || {
  echo "Database password verification failed after update." >&2
  exit 1
}

echo "Admin account updated successfully."
echo "user_id=${TARGET_USER_ID}"
echo "phone=${NEW_PHONE}"
echo "username=${MASKED_USERNAME}"
echo "role=admin"
echo "revoked_login_sessions=${REVOKED_SESSIONS}"
echo "current_row=${UPDATED_ROW}"
