-- Migration that converts money fields to cent-based integers.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(120) NOT NULL PRIMARY KEY COMMENT '迁移唯一标识',
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '执行时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @migration_name := '20260526_convert_money_to_cent';
SET @has_migrated := (
  SELECT COUNT(*)
  FROM schema_migrations
  WHERE name = @migration_name
);

SET @listing_sql := IF(
  @has_migrated = 0,
  'UPDATE listings SET deposit = deposit * 100, rent_price = rent_price * 100',
  'SELECT 1'
);

PREPARE migration_stmt FROM @listing_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @order_sql := IF(
  @has_migrated = 0,
  'UPDATE orders SET amount = amount * 100, deposit_amount = deposit_amount * 100',
  'SELECT 1'
);

PREPARE migration_stmt FROM @order_sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

INSERT INTO schema_migrations (name)
SELECT @migration_name
WHERE @has_migrated = 0;
