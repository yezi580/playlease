-- Migration that adds user ban tracking fields.

SET @has_banned_until := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'banned_until'
);

SET @migration_sql := IF(
  @has_banned_until = 0,
  'ALTER TABLE users ADD COLUMN banned_until DATETIME DEFAULT NULL COMMENT ''封禁截止时间，为空表示未封禁'' AFTER role',
  'SELECT 1'
);

PREPARE migration_stmt FROM @migration_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
