#!/usr/bin/env bash
set -euo pipefail

LINES="${1:-100}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-my-app-prod-mysql-1}"

case "${LINES}" in
  ''|*[!0-9]*)
    echo "Usage: bash deploy/scripts/tail-prod-mysql-slowlog.sh [lines]" >&2
    exit 1
    ;;
esac

if [ "${LINES}" -lt 1 ]; then
  LINES=100
fi

LOG_FILE="$(docker exec "${MYSQL_CONTAINER}" sh -lc 'ls -1 /var/lib/mysql/*slow*.log 2>/dev/null | head -n 1')"
if [ -z "${LOG_FILE}" ]; then
  echo "No slow query log file found."
  exit 0
fi

FILTERED_OUTPUT="$(docker exec -i "${MYSQL_CONTAINER}" awk 'BEGIN{show=0} /^# Time:/{show=1} show{print}' "${LOG_FILE}" || true)"
if [ -z "${FILTERED_OUTPUT}" ]; then
  echo "No slow query entries found yet."
  exit 0
fi

printf '%s\n' "${FILTERED_OUTPUT}" | tail -n "${LINES}"
