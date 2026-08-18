#!/usr/bin/env bash
# 一次性迁移：将全库 DATETIME 列从 UTC 墙钟 +8 小时为北京时间
# 前提：api 容器已停止（防止迁移期间产生新写入），MySQL 已切到 +08:00 时区
# 用法：bash migrate-datetime-to-beijing.sh
set -Eeuo pipefail

DB_NAME="${DB_NAME:-game_rental}"
CONTAINER="${MYSQL_CONTAINER:-my-app-prod-mysql-1}"

cat > /tmp/tz_gen.sql <<'EOSQL'
SELECT CONCAT('UPDATE `', table_name, '` SET `', column_name,
              '` = DATE_ADD(`', column_name, '`, INTERVAL 8 HOUR) WHERE `', column_name, '` IS NOT NULL;')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND data_type = 'datetime'
ORDER BY table_name, ordinal_position;
EOSQL

echo "== 生成迁移语句（全部 DATETIME 列 +8 小时） =="
docker exec -i "$CONTAINER" sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD -N -B $DB_NAME" < /tmp/tz_gen.sql > /tmp/tz_migration.sql

echo "共 $(grep -c '^UPDATE' /tmp/tz_migration.sql) 条 UPDATE，样例："
head -3 /tmp/tz_migration.sql

if [ "$(grep -c '^UPDATE' /tmp/tz_migration.sql)" -eq 0 ]; then
  echo "!! 未生成任何迁移语句，中止（检查 information_schema 权限或 DB_NAME）"
  exit 1
fi

echo "== 执行迁移 =="
docker exec -i "$CONTAINER" sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD $DB_NAME" < /tmp/tz_migration.sql

echo "== 迁移完成 =="
rm -f /tmp/tz_gen.sql /tmp/tz_migration.sql
