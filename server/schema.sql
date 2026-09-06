-- ================================================================
-- 租号网站数据库全量表结构（schema.sql）
-- 导出方式：2026-09-06 从生产库 mysqldump --no-data 导出，按业务分组整理
-- 表数量：39 张 = 36 张在用 + 3 张历史遗留（见文末「历史遗留表」）
--
-- 使用说明：
-- 1. 本文件用于全新环境初始化与结构查阅，不参与线上运行；
--    生产运行时的真实结构以 server/app.js 启动自动迁移
--    （CREATE TABLE IF NOT EXISTS / 条件 ALTER）为准。
-- 2. 新增表或列时，除更新 app.js 启动迁移外，务必同步本文件，
--    或重新从生产库导出覆盖，避免文件再次滞后。
-- 3. 金额字段一律用 BIGINT 以「分」为单位存储，避免浮点精度问题。
-- 4. 建表顺序已按外键依赖排列（users → listings → orders → …），
--    可自上而下直接执行，无需关闭 FOREIGN_KEY_CHECKS。
-- 5. 新表主键约定使用雪花ID（64位ID须以字符串返回前端），存量表保留自增。
--
-- 执行方式：mysql -u root -p < schema.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS game_rental DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE game_rental;

-- ================================================================
-- 一、用户与账号
-- ================================================================

-- 用户表：注册用户账号（手机号+密码登录），含邀请体系与汇付收益账户快照
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户唯一ID',
  username VARCHAR(50) NOT NULL COMMENT '显示名称（自动从手机号生成，如138****1234）',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt加密后的密码哈希',
  phone VARCHAR(20) NOT NULL COMMENT '手机号（唯一，作为登录标识）',
  role ENUM('user','support','admin') NOT NULL DEFAULT 'user' COMMENT '角色：普通用户/客服/管理员',
  banned_until DATETIME DEFAULT NULL COMMENT '封禁截止时间，为空表示未封禁',
  invite_code VARCHAR(16) DEFAULT NULL COMMENT '用户专属邀请码（唯一）',
  inviter_user_id INT DEFAULT NULL COMMENT '邀请人用户ID',
  bound_invite_code VARCHAR(16) DEFAULT NULL COMMENT '已绑定的邀请码快照（不可修改）',
  invite_bound_at DATETIME DEFAULT NULL COMMENT '邀请码绑定时间',
  kyc_status ENUM('unverified','pending','verified','failed') NOT NULL DEFAULT 'unverified' COMMENT '实名认证状态',
  kyc_real_name VARCHAR(50) DEFAULT NULL COMMENT '实名姓名快照',
  kyc_real_name_masked VARCHAR(50) DEFAULT NULL COMMENT '脱敏后的实名姓名',
  kyc_id_card_masked VARCHAR(40) DEFAULT NULL COMMENT '脱敏后的证件号',
  kyc_verified_at DATETIME DEFAULT NULL COMMENT '实名认证通过时间',
  huifu_sub_merchant_id VARCHAR(64) DEFAULT NULL COMMENT '汇付子商户号',
  huifu_kyc_status ENUM('unverified','pending','verified','failed') NOT NULL DEFAULT 'unverified' COMMENT '汇付收益账户状态',
  huifu_kyc_bound_at DATETIME DEFAULT NULL COMMENT '汇付收益账户绑定时间',
  huifu_settlement_card_token VARCHAR(128) DEFAULT NULL COMMENT '汇付结算卡标识',
  huifu_split_receiver_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已开通分账接收能力',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE INDEX uk_users_phone (phone),
  UNIQUE INDEX uk_users_invite_code (invite_code),
  INDEX idx_users_inviter_user_id (inviter_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理员 Passkey 凭证表：WebAuthn 免密登录
CREATE TABLE IF NOT EXISTS admin_passkeys (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员 Passkey 凭证ID',
  user_id INT NOT NULL COMMENT '所属管理员用户ID',
  credential_id VARCHAR(512) NOT NULL COMMENT 'WebAuthn credential id（base64url）',
  public_key TEXT COMMENT '注册后保存的公钥，后续用于 assertion 验签',
  public_key_format VARCHAR(50) NOT NULL DEFAULT 'unknown' COMMENT '公钥格式，预留 spki_pem/cose 等',
  sign_count BIGINT NOT NULL DEFAULT 0 COMMENT '签名计数器',
  transports VARCHAR(255) DEFAULT NULL COMMENT '设备传输方式，逗号分隔',
  device_name VARCHAR(120) DEFAULT NULL COMMENT '管理员给设备起的名称',
  aaguid VARCHAR(64) DEFAULT NULL COMMENT '认证器 AAGUID',
  is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  last_used_at DATETIME DEFAULT NULL COMMENT '最后使用时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_admin_passkeys_credential_id (credential_id),
  INDEX idx_admin_passkeys_user_id (user_id, is_active),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理员受信任设备表：Passkey 之外的免验证设备白名单
CREATE TABLE IF NOT EXISTS admin_trusted_devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '受信任设备记录ID',
  user_id INT NOT NULL COMMENT '所属管理员用户ID',
  token_hash CHAR(64) NOT NULL COMMENT '设备令牌 SHA-256 哈希',
  device_name VARCHAR(120) DEFAULT NULL COMMENT '管理员给设备起的名称',
  user_agent VARCHAR(255) DEFAULT NULL COMMENT '浏览器 UA',
  last_ip VARCHAR(64) DEFAULT NULL COMMENT '最近 IP',
  last_used_at DATETIME DEFAULT NULL COMMENT '最近使用时间',
  expires_at DATETIME NOT NULL COMMENT '到期时间',
  revoked_at DATETIME DEFAULT NULL COMMENT '撤销时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_admin_trusted_devices_token_hash (token_hash),
  INDEX idx_admin_trusted_devices_user_id (user_id, revoked_at, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 二、商品
-- ================================================================

-- 商品列表表：每个出租账号的完整信息
CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '商品唯一ID',
  listing_no VARCHAR(20) DEFAULT NULL COMMENT '商品编号（年月日+4位随机数，如202605191652）',
  owner_user_id INT NOT NULL COMMENT '发布人用户ID，用于个人中心查询我发布的商品',
  owner_name VARCHAR(100) NOT NULL COMMENT '发布者显示名（如138****1234）',
  seller_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '卖家联系微信号',
  listing_status ENUM('active', 'inactive', 'pending_review', 'sold_out', 'rented') NOT NULL DEFAULT 'active' COMMENT '商品状态：上架中/已下架/审核中/已售出/已租出',
  review_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' COMMENT '审核状态：待审/通过/驳回',
  reviewed_by INT DEFAULT NULL COMMENT '最后审核管理员ID',
  reviewed_at DATETIME DEFAULT NULL COMMENT '最后审核时间',
  review_reason VARCHAR(500) DEFAULT NULL COMMENT '审核备注或驳回原因',
  review_assignee_id INT DEFAULT NULL COMMENT '派给的客服ID（商品审核工单）',
  review_assigned_at DATETIME DEFAULT NULL COMMENT '派单时间',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间（DATETIME格式）',
  insurance_level VARCHAR(80) NOT NULL DEFAULT '' COMMENT '安全箱等级',
  compensation_plan VARCHAR(20) NOT NULL DEFAULT 'basic' COMMENT '保险赔付方案（premium/medium/basic）',
  energy_level VARCHAR(30) NOT NULL DEFAULT '' COMMENT '体力等级',
  weight_level VARCHAR(30) NOT NULL DEFAULT '' COMMENT '负重等级',
  dive_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '潜水等级（0-3）',
  decontamination_chamber_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '洗消舱等级（0-3）',
  login_method VARCHAR(30) NOT NULL DEFAULT '' COMMENT '上号方式（QQ账密/微信扫码等）',
  login_time_range VARCHAR(60) NOT NULL DEFAULT '' COMMENT '上号时间范围（如"09:00-23:00"）',
  daily_cost BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '每日消耗哈夫币(M，整数)',
  base_ratio BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '基础比例（万哈夫币/元，整数）',
  rent_days TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '出租天数（正整数）',
  hafu_coin BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '哈夫币余额(M，整数)',
  secret_kd DECIMAL(4,1) NOT NULL DEFAULT 0.0 COMMENT '绝密KD（允许1位小数）',
  rank_name VARCHAR(30) NOT NULL DEFAULT '' COMMENT '段位名称',
  character_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '角色等级（固定60级满级）',
  region VARCHAR(80) NOT NULL DEFAULT '' COMMENT '所在地区',
  face_verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '人脸归属本人（0否/1是）',
  seyed_unlocked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '赛依德已解锁（0否/1是）',
  ban_record TINYINT(1) NOT NULL DEFAULT 0 COMMENT '封禁记录（0无/1有）',
  ban_video_url VARCHAR(500) DEFAULT NULL COMMENT '无封禁记录视频URL',
  operator_appearance VARCHAR(200) DEFAULT NULL COMMENT '干员外观描述',
  gold_skin VARCHAR(200) DEFAULT NULL COMMENT '人物金皮描述',
  knife_skin VARCHAR(200) DEFAULT NULL COMMENT '持有刀皮描述',
  weapon_skin VARCHAR(200) DEFAULT NULL COMMENT '武器皮肤描述',
  deposit BIGINT NOT NULL DEFAULT 0 COMMENT '押金（分为单位）',
  rent_price BIGINT NOT NULL DEFAULT 0 COMMENT '租金（分为单位）',
  remark TEXT COMMENT '商品备注说明',
  cover_image VARCHAR(500) DEFAULT NULL COMMENT '封面图URL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE INDEX uk_listings_listing_no (listing_no),
  INDEX idx_listings_owner_user_id (owner_user_id),
  INDEX idx_listings_status (listing_status),
  INDEX idx_listings_owner_status (owner_user_id, listing_status),
  INDEX idx_listings_status_created (listing_status, created_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品物品表：每个商品包含的额外物品详情及处理方式（一对多）
CREATE TABLE IF NOT EXISTS listing_items (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  item_key VARCHAR(40) NOT NULL COMMENT '道具标识符（如 topCard / awmBullet）',
  item_name VARCHAR(120) NOT NULL COMMENT '道具显示名称',
  item_mode ENUM('sale', 'gift') NOT NULL DEFAULT 'sale' COMMENT '额外物品处理方式：出售/赠送',
  quantity INT UNSIGNED DEFAULT NULL COMMENT '数量（正整数）',
  unit_price BIGINT DEFAULT NULL COMMENT '单价（分为单位，整数）',
  total_price BIGINT DEFAULT NULL COMMENT '总价（分为单位，整数）',
  INDEX idx_listing_id (listing_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品图片表：商品展示图片（一对多）
CREATE TABLE IF NOT EXISTS listing_images (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  image_url LONGTEXT NOT NULL COMMENT '图片URL或Base64数据',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  INDEX idx_listing_id (listing_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品封禁截图表：封禁记录截图（一对多）
CREATE TABLE IF NOT EXISTS listing_ban_images (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  image_url VARCHAR(500) NOT NULL COMMENT '处罚截图URL',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  INDEX idx_listing_ban_images_listing_id (listing_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品点击去重表：统计近7天独立点击用户数
CREATE TABLE IF NOT EXISTS listing_click_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID',
  listing_id INT NOT NULL COMMENT '商品ID',
  user_id INT NOT NULL COMMENT '点击用户ID',
  first_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次点击时间',
  last_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次点击时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_listing_click_users_listing_user (listing_id, user_id),
  INDEX idx_listing_click_users_user_id (user_id),
  INDEX idx_listing_click_users_last_clicked_listing (last_clicked_at, listing_id),
  INDEX idx_listing_click_users_listing_last_clicked (listing_id, last_clicked_at),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品 7 日热度预聚合表：定时任务周期刷新，商品列表接口直接 JOIN 使用
CREATE TABLE IF NOT EXISTS listing_hot_stats (
  listing_id INT NOT NULL COMMENT '商品ID',
  unique_click_7d INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '近7天独立访客点击数（周期预聚合）',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后聚合时间',
  PRIMARY KEY (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 三、订单与结算
-- ================================================================

-- 订单表：用户下单后的交易记录（金额单位：分）
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单唯一ID',
  order_no VARCHAR(40) NOT NULL COMMENT '订单编号',
  buyer_id INT NOT NULL COMMENT '下单用户ID',
  seller_id INT DEFAULT NULL COMMENT '卖家用户ID，用于卖家视角订单查询',
  listing_id INT NOT NULL COMMENT '关联商品ID',
  seller_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '卖家名称快照',
  buyer_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '买家联系微信号快照',
  seller_contact_wechat VARCHAR(50) NOT NULL DEFAULT '' COMMENT '卖家联系微信号快照',
  listing_title VARCHAR(200) NOT NULL DEFAULT '' COMMENT '商品标题快照',
  listing_cover_image VARCHAR(500) DEFAULT NULL COMMENT '商品封面快照',
  rent_days TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '租用天数',
  seller_rent_amount BIGINT NOT NULL DEFAULT 0 COMMENT '卖家发布租金快照（分）',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '订单金额（分为单位）',
  deposit_amount BIGINT NOT NULL DEFAULT 0 COMMENT '押金金额（分为单位）',
  status ENUM('pending_payment','paid','support_handling','settlement_pending','deposit_holding','completed','cancelled') NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态',
  settlement_status ENUM('none','buyer_reported','seller_confirmed','executed') NOT NULL DEFAULT 'none' COMMENT '结算状态',
  support_scene VARCHAR(50) NOT NULL DEFAULT 'none' COMMENT '客服处理场景：none/cancel_request/settlement_dispute',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间',
  paid_at DATETIME DEFAULT NULL COMMENT '支付时间',
  verified_at DATETIME DEFAULT NULL COMMENT '验号成功时间',
  buyer_item_reported_at DATETIME DEFAULT NULL COMMENT '买家填报额外物品时间',
  seller_item_confirmed_at DATETIME DEFAULT NULL COMMENT '卖家确认额外物品时间',
  settlement_executed_at DATETIME DEFAULT NULL COMMENT '执行分账时间',
  settlement_requested_at DATETIME DEFAULT NULL COMMENT '申请进入结算流程时间',
  cancel_requested_by INT DEFAULT NULL COMMENT '发起取消的用户ID',
  cancel_requested_at DATETIME DEFAULT NULL COMMENT '发起取消时间',
  cancel_reason VARCHAR(500) DEFAULT NULL COMMENT '取消原因',
  finished_at DATETIME DEFAULT NULL COMMENT '完成时间',
  cancelled_at DATETIME DEFAULT NULL COMMENT '取消时间',
  support_status ENUM('none','pending','handling','resolved') NOT NULL DEFAULT 'none' COMMENT '客服介入状态',
  support_requested_at DATETIME DEFAULT NULL COMMENT '申请客服介入时间',
  support_requested_by INT DEFAULT NULL COMMENT '申请客服介入的用户ID',
  support_assignee_id INT DEFAULT NULL COMMENT '当前处理客服用户ID',
  support_handling_at DATETIME DEFAULT NULL COMMENT '客服领取并开始处理时间',
  support_note VARCHAR(500) DEFAULT NULL COMMENT '客服处理备注',
  support_origin_status VARCHAR(50) DEFAULT NULL COMMENT '客服冻结前原始订单状态',
  support_freeze_reason VARCHAR(500) DEFAULT NULL COMMENT '客服冻结资金原因',
  support_resolved_at DATETIME DEFAULT NULL COMMENT '客服处理完成时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  huifu_hosting_seq_id VARCHAR(100) DEFAULT NULL COMMENT '汇付支付流水号',
  huifu_oco_order_no VARCHAR(100) DEFAULT NULL COMMENT '汇付OCO业务单号',
  huifu_pay_status VARCHAR(30) DEFAULT NULL COMMENT '汇付支付状态',
  huifu_split_status VARCHAR(30) DEFAULT NULL COMMENT '汇付分账状态',
  huifu_refund_status VARCHAR(30) DEFAULT NULL COMMENT '汇付退款状态',
  huifu_last_sync_at DATETIME DEFAULT NULL COMMENT '最近一次汇付状态同步时间',
  UNIQUE INDEX uk_orders_order_no (order_no),
  INDEX idx_orders_buyer_id (buyer_id),
  INDEX idx_orders_seller_id (seller_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_buyer_status (buyer_id, status),
  INDEX idx_orders_seller_status (seller_id, status),
  INDEX idx_orders_listing_id (listing_id),
  INDEX idx_orders_status_created (status, created_at),
  INDEX idx_orders_status_paid (status, paid_at),
  INDEX idx_orders_status_settlement_requested (status, settlement_requested_at),
  INDEX idx_orders_support_assignee_status (support_assignee_id, support_status),
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单物品快照表：下单时额外物品的定价快照（买家侧/卖家侧双价，互不可见）
CREATE TABLE IF NOT EXISTS order_item_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单物品快照ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  item_key VARCHAR(40) NOT NULL COMMENT '道具标识',
  item_name VARCHAR(120) NOT NULL COMMENT '道具名称',
  item_mode ENUM('sale','gift') NOT NULL DEFAULT 'sale' COMMENT '道具处理方式',
  quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '快照数量',
  unit_price BIGINT NOT NULL DEFAULT 0 COMMENT '快照单价（分）',
  buyer_unit_price BIGINT NOT NULL DEFAULT 0 COMMENT '买家侧结算单价快照（分，0=与卖家价一致）',
  total_price BIGINT NOT NULL DEFAULT 0 COMMENT '快照总价（分）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE INDEX uk_order_item_snapshot_order_item (order_id, item_key),
  INDEX idx_order_item_snapshots_order_id (order_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单额外物品使用记录表：买家填报使用数量、卖家确认
CREATE TABLE IF NOT EXISTS order_item_usage_reports (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单额外物品使用记录ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  item_key VARCHAR(40) NOT NULL COMMENT '道具标识',
  snapshot_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '快照数量',
  reported_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '买家填报使用数量',
  reported_total_price BIGINT NOT NULL DEFAULT 0 COMMENT '买家填报总价（分）',
  buyer_total_price BIGINT NOT NULL DEFAULT 0 COMMENT '买家侧扣款总价（分，含买家侧升价）',
  buyer_note VARCHAR(500) DEFAULT NULL COMMENT '买家补充说明',
  buyer_reported_by INT DEFAULT NULL COMMENT '填报人用户ID',
  buyer_reported_at DATETIME DEFAULT NULL COMMENT '填报时间',
  seller_confirmed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '卖家是否确认',
  seller_confirmed_by INT DEFAULT NULL COMMENT '卖家确认人ID',
  seller_confirmed_at DATETIME DEFAULT NULL COMMENT '卖家确认时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_order_item_usage_order_item (order_id, item_key),
  INDEX idx_order_item_usage_order_id (order_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单结算表：结单分账明细（一单一记录，支持手动结单与冻结裁决）
CREATE TABLE IF NOT EXISTS order_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单结算ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  rent_amount BIGINT NOT NULL DEFAULT 0 COMMENT '租金（分）',
  deposit_amount BIGINT NOT NULL DEFAULT 0 COMMENT '押金（分）',
  used_items_amount BIGINT NOT NULL DEFAULT 0 COMMENT '出售物品使用金额（分）',
  platform_fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '平台抽成（分）',
  seller_income_amount BIGINT NOT NULL DEFAULT 0 COMMENT '卖家入账金额（分）',
  buyer_refund_amount BIGINT NOT NULL DEFAULT 0 COMMENT '买家退款金额（分）',
  payout_mode ENUM('huifu','manual') NOT NULL DEFAULT 'huifu' COMMENT '卖家结算款支付方式（汇付余额支付/客服线下手动支付）',
  manual_payout_note VARCHAR(500) DEFAULT NULL COMMENT '手动结单备注（客服填写的原因与线下收款安排）',
  frozen_liable_party ENUM('seller','buyer') DEFAULT NULL COMMENT '冻结裁决责任方（仅冻结结算有值）',
  status ENUM('draft','executed') NOT NULL DEFAULT 'draft' COMMENT '结算状态',
  refund_request_no VARCHAR(100) DEFAULT NULL COMMENT '退款请求号',
  refund_provider_no VARCHAR(100) DEFAULT NULL COMMENT '退款流水号',
  split_request_no VARCHAR(100) DEFAULT NULL COMMENT '分账请求号',
  split_provider_no VARCHAR(100) DEFAULT NULL COMMENT '分账流水号',
  provider_status VARCHAR(50) DEFAULT NULL COMMENT '第三方执行状态',
  provider_payload LONGTEXT COMMENT '第三方响应JSON',
  executed_by_support_id INT DEFAULT NULL COMMENT '执行分账的客服ID',
  executed_at DATETIME DEFAULT NULL COMMENT '执行时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_order_settlements_order_id (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 押金保管表：结单后押金进入冷静期保管，到期自动退回买家；期间卖家可举报，客服裁决
CREATE TABLE IF NOT EXISTS order_deposit_holds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '押金保管记录ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  buyer_id INT NOT NULL COMMENT '买家用户ID',
  seller_id INT NOT NULL COMMENT '卖家用户ID',
  hold_amount BIGINT NOT NULL DEFAULT 0 COMMENT '保管中的押金金额（分）',
  status ENUM('holding','disputed','releasing','released','confiscating','confiscated') NOT NULL DEFAULT 'holding' COMMENT '保管状态：保管中/已举报待裁决/退款处理中/已退回买家/赔付处理中/已赔付卖家',
  hold_days INT NOT NULL DEFAULT 3 COMMENT '保管天数（结算时点的冷静期配置快照）',
  release_at DATETIME NOT NULL COMMENT '预计自动退回时间',
  released_at DATETIME DEFAULT NULL COMMENT '实际退回买家时间',
  reported_at DATETIME DEFAULT NULL COMMENT '卖家举报时间',
  report_reason VARCHAR(500) DEFAULT NULL COMMENT '卖家举报原因',
  verdict ENUM('refund','confiscate') DEFAULT NULL COMMENT '客服裁决结果：退回买家/没收赔付卖家',
  verdict_note VARCHAR(500) DEFAULT NULL COMMENT '客服裁决说明',
  verdict_by_support_id INT DEFAULT NULL COMMENT '裁决客服ID',
  verdict_at DATETIME DEFAULT NULL COMMENT '裁决时间',
  refund_reason VARCHAR(255) DEFAULT NULL COMMENT '退买家退款流水的幂等 reason',
  payout_remark VARCHAR(255) DEFAULT NULL COMMENT '赔卖家打款流水的幂等 remark',
  payout_mode ENUM('huifu','manual') NOT NULL DEFAULT 'huifu' COMMENT '赔付卖家支付方式（汇付余额支付/客服线下手动支付）',
  manual_payout_note VARCHAR(500) DEFAULT NULL COMMENT '线下赔付备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_order_deposit_holds_order_id (order_id),
  INDEX idx_order_deposit_holds_status_release (status, release_at),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 客服工单事件表：订单客服处理时间线（买家/卖家/客服可见性不同）
CREATE TABLE IF NOT EXISTS support_order_events (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '客服工单事件ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  event_type ENUM('requested','claimed','note_updated','resolved','abnormal_reported','cancelled','funds_frozen','funds_released','deposit_dispute','deposit_verdict','deposit_resolved','reassigned') NOT NULL COMMENT '事件类型',
  operator_user_id INT DEFAULT NULL COMMENT '操作人用户ID',
  operator_role ENUM('buyer','seller','support','system') NOT NULL DEFAULT 'system' COMMENT '操作人角色',
  operator_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '操作人展示名',
  title VARCHAR(100) NOT NULL DEFAULT '' COMMENT '时间线标题',
  description VARCHAR(500) NOT NULL DEFAULT '' COMMENT '时间线描述',
  public_message VARCHAR(500) DEFAULT NULL COMMENT '同步到订单会话的系统消息',
  note VARCHAR(500) DEFAULT NULL COMMENT '本次事件附带备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_support_order_events_order_id (order_id, id),
  INDEX idx_support_order_events_operator (operator_user_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 四、支付与资金
-- ================================================================

-- 支付流水表：所有渠道的支付单（汇付收银台等）
CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '支付流水ID',
  transaction_no VARCHAR(40) NOT NULL COMMENT '平台支付流水号',
  user_id INT NOT NULL COMMENT '付款用户ID',
  order_id INT DEFAULT NULL COMMENT '关联订单ID',
  business_type VARCHAR(50) NOT NULL DEFAULT 'order_payment' COMMENT '业务类型',
  channel VARCHAR(30) NOT NULL DEFAULT 'alipay' COMMENT '支付渠道',
  provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '渠道服务商',
  subject VARCHAR(255) DEFAULT NULL COMMENT '支付标题',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '支付金额（分）',
  status ENUM('created','pending','paid','failed','cancelled','closed') NOT NULL DEFAULT 'created' COMMENT '支付状态',
  business_sync_status ENUM('pending','synced','failed') NOT NULL DEFAULT 'pending' COMMENT '业务同步状态',
  business_sync_message VARCHAR(255) DEFAULT NULL COMMENT '业务同步说明',
  provider_trade_no VARCHAR(100) DEFAULT NULL COMMENT '服务商交易号',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商请求号',
  provider_order_no VARCHAR(100) DEFAULT NULL COMMENT '服务商订单号',
  provider_hosting_seq_id VARCHAR(100) DEFAULT NULL COMMENT '汇付托管流水号',
  provider_oco_order_no VARCHAR(100) DEFAULT NULL COMMENT '汇付OCO订单号',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  paid_at DATETIME DEFAULT NULL COMMENT '支付成功时间',
  expires_at DATETIME DEFAULT NULL COMMENT '支付过期时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_payment_transactions_no (transaction_no),
  INDEX idx_payment_transactions_order_id (order_id, id),
  INDEX idx_payment_transactions_user_id (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 退款单表：原路退款记录（退款受理即时到账异步，查单确认后关单）
CREATE TABLE IF NOT EXISTS payment_refunds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '退款单ID',
  refund_no VARCHAR(40) NOT NULL COMMENT '平台退款单号',
  transaction_no VARCHAR(40) NOT NULL COMMENT '原支付流水号',
  order_id INT DEFAULT NULL COMMENT '关联订单ID',
  user_id INT NOT NULL COMMENT '退款归属用户ID',
  refund_type ENUM('full','partial') NOT NULL DEFAULT 'partial' COMMENT '退款类型',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '退款金额（分）',
  reason VARCHAR(255) DEFAULT NULL COMMENT '退款原因',
  provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '退款服务商',
  status ENUM('pending','processing','success','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT '退款状态',
  provider_refund_no VARCHAR(100) DEFAULT NULL COMMENT '服务商退款单号',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
  completed_at DATETIME DEFAULT NULL COMMENT '退款完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_payment_refunds_no (refund_no),
  INDEX idx_payment_refunds_transaction_no (transaction_no, id),
  INDEX idx_payment_refunds_order_id (order_id, id),
  INDEX idx_payment_refunds_user_id (user_id, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 余额支付单表：结算时向卖家打款（汇付余额支付）
CREATE TABLE IF NOT EXISTS settlement_payouts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '余额支付单ID',
  payout_no VARCHAR(40) NOT NULL COMMENT '平台余额支付单号',
  order_id INT NOT NULL COMMENT '关联订单ID',
  payee_user_id INT NOT NULL COMMENT '收款用户ID',
  provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '余额支付服务商',
  status ENUM('pending','processing','success','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT '打款状态',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '打款金额（分）',
  account_name VARCHAR(80) NOT NULL DEFAULT '' COMMENT '收款人姓名',
  payee_huifu_id VARCHAR(32) NOT NULL DEFAULT '' COMMENT '收款方汇付ID',
  payee_acct_id VARCHAR(32) DEFAULT NULL COMMENT '收款方账户号',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商打款单号',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
  completed_at DATETIME DEFAULT NULL COMMENT '打款完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_settlement_payouts_no (payout_no),
  INDEX idx_settlement_payouts_order_id (order_id, id),
  INDEX idx_settlement_payouts_payee_user_id (payee_user_id, id),
  INDEX idx_settlement_payouts_status (status, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (payee_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户收款账户表：卖家汇付进件/绑卡信息（一人一记录）
CREATE TABLE IF NOT EXISTS user_settlement_accounts (
  user_id INT NOT NULL COMMENT '用户ID',
  provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '结算服务商',
  account_type ENUM('person','enterprise') NOT NULL DEFAULT 'person' COMMENT '收款主体类型',
  bind_status ENUM('unbound','pending','active','disabled') NOT NULL DEFAULT 'unbound' COMMENT '绑定状态',
  huifu_id VARCHAR(32) DEFAULT NULL COMMENT '汇付ID',
  acct_id VARCHAR(32) DEFAULT NULL COMMENT '汇付账户号',
  account_name VARCHAR(80) NOT NULL DEFAULT '' COMMENT '收款人姓名',
  mobile VARCHAR(20) DEFAULT NULL COMMENT '预留手机号',
  id_card_masked VARCHAR(40) DEFAULT NULL COMMENT '脱敏证件号',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  last_verified_at DATETIME DEFAULT NULL COMMENT '最近校验时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id),
  INDEX idx_user_settlement_accounts_status (bind_status, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 钱包账户表：用户平台余额（一人一记录）
CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id INT NOT NULL COMMENT '用户ID',
  balance BIGINT NOT NULL DEFAULT 0 COMMENT '钱包余额（分）',
  frozen_balance BIGINT NOT NULL DEFAULT 0 COMMENT '提现冻结金额（分）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 钱包流水表：余额变动明细（记录变动前后余额，便于对账）
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '钱包流水ID',
  user_id INT NOT NULL COMMENT '用户ID',
  order_id INT DEFAULT NULL COMMENT '关联订单ID',
  business_type VARCHAR(50) NOT NULL DEFAULT 'order' COMMENT '业务类型',
  direction ENUM('credit','debit') NOT NULL DEFAULT 'credit' COMMENT '流水方向',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '变动金额（分）',
  balance_before BIGINT NOT NULL DEFAULT 0 COMMENT '变动前余额（分）',
  balance_after BIGINT NOT NULL DEFAULT 0 COMMENT '变动后余额（分）',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_wallet_ledger_user_created (user_id, created_at, id),
  INDEX idx_wallet_ledger_order_id (order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 取现单表：钱包余额提现到银行卡（汇付代付）
CREATE TABLE IF NOT EXISTS encashments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '取现单ID',
  encashment_no VARCHAR(64) NOT NULL COMMENT '平台取现单号(汇付req_seq_id)',
  user_id INT NOT NULL COMMENT '发起取现用户ID',
  provider VARCHAR(50) NOT NULL DEFAULT 'mock_payment' COMMENT '取现服务商',
  status ENUM('pending','processing','success','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT '取现状态',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '取现金额（分）',
  huifu_id VARCHAR(32) NOT NULL DEFAULT '' COMMENT '取现汇付ID',
  token_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '取现卡序列号',
  into_acct_date_type VARCHAR(8) NOT NULL DEFAULT 'D1' COMMENT '到账时效 D1/T1/TS',
  trans_stat VARCHAR(8) DEFAULT NULL COMMENT '汇付交易状态原始值(P/S/F/C)',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '汇付流水号(hf_seq_id)',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
  completed_at DATETIME DEFAULT NULL COMMENT '到账完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_encashments_no (encashment_no),
  INDEX idx_encashments_user_id (user_id, id),
  INDEX idx_encashments_status (status, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 邀请返现表：被邀请人成交后给邀请人的返现（含分账与打款状态）
CREATE TABLE IF NOT EXISTS invite_rewards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '邀请返现记录ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  inviter_user_id INT NOT NULL COMMENT '邀请人用户ID',
  invitee_user_id INT NOT NULL COMMENT '被邀请人用户ID',
  reward_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 5.00 COMMENT '返现比例',
  platform_fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '平台收益（分）',
  reward_amount BIGINT NOT NULL DEFAULT 0 COMMENT '返现金额（分）',
  payout_status ENUM('pending','paid','failed','wallet_credited') NOT NULL DEFAULT 'pending' COMMENT '打款状态',
  payout_no VARCHAR(40) DEFAULT NULL COMMENT '汇付打款单号',
  status ENUM('pending_claim','split_success','cancelled') NOT NULL DEFAULT 'pending_claim' COMMENT '返现状态',
  split_request_no VARCHAR(100) DEFAULT NULL COMMENT '分账请求号',
  provider_split_no VARCHAR(100) DEFAULT NULL COMMENT '汇付分账流水号',
  awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '返现发放时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_invite_rewards_order_id (order_id),
  INDEX idx_invite_rewards_inviter (inviter_user_id, awarded_at, id),
  INDEX idx_invite_rewards_invitee (invitee_user_id, awarded_at, id),
  INDEX idx_invite_rewards_payout_status (payout_status, id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 五、聊天与售前咨询
-- ================================================================

-- 会话表：订单沟通与售前咨询会话（type+ref_id 唯一）
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '会话唯一ID',
  type ENUM('order','presale') NOT NULL DEFAULT 'order' COMMENT '会话类型',
  ref_id INT NOT NULL COMMENT '关联业务ID（订单ID或售前咨询ID）',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '会话标题',
  status ENUM('active','closed') NOT NULL DEFAULT 'active' COMMENT '会话状态',
  last_message_preview VARCHAR(255) DEFAULT NULL COMMENT '最后一条消息预览',
  last_message_at DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE INDEX uk_conversations_type_ref (type, ref_id),
  INDEX idx_conversations_last_message_at (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话参与人表：会话成员与已读进度
CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  user_id INT NOT NULL COMMENT '参与人用户ID',
  role ENUM('buyer','seller','support') NOT NULL DEFAULT 'buyer' COMMENT '会话角色',
  last_read_message_id INT DEFAULT NULL COMMENT '最后已读消息ID',
  unread_message_count INT NOT NULL DEFAULT 0 COMMENT '当前未读消息数',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  UNIQUE INDEX uk_conversation_participants_user (conversation_id, user_id),
  INDEX idx_conversation_participants_user_id (user_id),
  INDEX idx_conversation_participants_user_conversation_read (user_id, conversation_id, last_read_message_id, unread_message_count),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话消息表：聊天消息（文本/图片/系统）
CREATE TABLE IF NOT EXISTS conversation_messages (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '消息唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  sender_user_id INT NOT NULL COMMENT '发送人用户ID',
  message_type ENUM('text','image','system') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  content TEXT NOT NULL COMMENT '消息内容',
  media_url VARCHAR(500) DEFAULT NULL COMMENT '图片消息URL',
  media_name VARCHAR(255) DEFAULT NULL COMMENT '上传文件名',
  media_size INT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  INDEX idx_conversation_messages_conversation (conversation_id, id),
  INDEX idx_conversation_messages_sender (sender_user_id),
  INDEX idx_conversation_messages_conversation_sender_id (conversation_id, sender_user_id, id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 聊天图片上传记录表：发送前先传图、发送后绑定消息
CREATE TABLE IF NOT EXISTS conversation_message_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '聊天图片上传记录ID',
  conversation_id INT NOT NULL COMMENT '会话ID',
  uploader_user_id INT NOT NULL COMMENT '上传用户ID',
  media_url VARCHAR(500) NOT NULL COMMENT '图片URL',
  media_name VARCHAR(255) DEFAULT NULL COMMENT '原始文件名',
  media_size INT NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
  consumed_message_id INT DEFAULT NULL COMMENT '已绑定消息ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  consumed_at DATETIME DEFAULT NULL COMMENT '绑定消息时间',
  UNIQUE INDEX uk_conversation_message_uploads_media_url (media_url),
  INDEX idx_conversation_message_uploads_uploader (uploader_user_id),
  INDEX idx_conversation_message_uploads_conversation_user (conversation_id, uploader_user_id, consumed_message_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 售前咨询表：下单前的客服咨询工单
CREATE TABLE IF NOT EXISTS presale_consultations (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '售前咨询ID',
  user_id INT NOT NULL COMMENT '发起咨询的用户ID',
  support_assignee_id INT NOT NULL COMMENT '当前负责客服ID',
  support_status ENUM('handling','resolved') NOT NULL DEFAULT 'handling' COMMENT '售前咨询处理状态',
  support_note VARCHAR(500) DEFAULT NULL COMMENT '客服内部备注',
  resolved_at DATETIME DEFAULT NULL COMMENT '处理完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_presale_consultations_user_status (user_id, support_status, id),
  INDEX idx_presale_consultations_support_status (support_assignee_id, support_status, id),
  INDEX idx_presale_consultations_updated_at (updated_at, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (support_assignee_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 六、反馈 / 通知 / 风控统计
-- ================================================================

-- 用户问题反馈表：前台用户提交的问题与管理员处理结果
CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '问题反馈ID',
  user_id INT NOT NULL COMMENT '提交用户ID',
  category_code VARCHAR(50) NOT NULL DEFAULT '' COMMENT '问题分类编码',
  category_label VARCHAR(50) NOT NULL DEFAULT '' COMMENT '问题分类名称',
  description VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '问题描述',
  status ENUM('pending', 'processing', 'resolved', 'rejected') NOT NULL DEFAULT 'pending' COMMENT '处理状态',
  admin_note VARCHAR(500) DEFAULT NULL COMMENT '管理员处理备注',
  handled_by_user_id INT DEFAULT NULL COMMENT '处理管理员ID',
  handled_at DATETIME DEFAULT NULL COMMENT '处理时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_user_feedback_handled_by (handled_by_user_id),
  INDEX idx_user_feedback_user_created (user_id, created_at, id),
  INDEX idx_user_feedback_status_created (status, created_at, id),
  INDEX idx_user_feedback_category_created (category_code, created_at, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (handled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 站内通知表：用户侧站内消息
CREATE TABLE IF NOT EXISTS user_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '站内通知ID',
  user_id INT NOT NULL COMMENT '接收通知的用户ID',
  category VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT '通知分类',
  title VARCHAR(120) NOT NULL DEFAULT '' COMMENT '通知标题',
  content VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '通知内容',
  related_type VARCHAR(50) DEFAULT NULL COMMENT '关联对象类型',
  related_id INT DEFAULT NULL COMMENT '关联对象ID',
  is_read TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读',
  read_at DATETIME DEFAULT NULL COMMENT '已读时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_user_notifications_user_created (user_id, created_at, id),
  INDEX idx_user_notifications_user_read (user_id, is_read, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 短信日发送统计表（按手机号+场景）
CREATE TABLE IF NOT EXISTS sms_send_daily_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '短信日发送统计ID',
  phone VARCHAR(20) NOT NULL COMMENT '手机号',
  scene VARCHAR(30) NOT NULL DEFAULT 'login' COMMENT '发送场景',
  send_date DATE NOT NULL COMMENT '统计日期',
  send_count INT NOT NULL DEFAULT 0 COMMENT '当日发送次数',
  last_sent_at DATETIME DEFAULT NULL COMMENT '最近发送时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_sms_send_daily_stats (phone, scene, send_date),
  INDEX idx_sms_send_daily_stats_date (send_date, phone, scene)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 短信IP日发送统计表（防刷限流）
CREATE TABLE IF NOT EXISTS sms_send_ip_daily_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '短信IP日发送统计ID',
  ip_address VARCHAR(64) NOT NULL COMMENT '请求IP',
  send_date DATE NOT NULL COMMENT '统计日期',
  send_count INT NOT NULL DEFAULT 0 COMMENT '当日发送次数',
  last_sent_at DATETIME DEFAULT NULL COMMENT '最近发送时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_sms_send_ip_daily_stats (ip_address, send_date),
  INDEX idx_sms_send_ip_daily_stats_date (send_date, ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户上传日统计表（流量控制）
CREATE TABLE IF NOT EXISTS user_upload_daily_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户上传日统计ID',
  user_id INT NOT NULL COMMENT '用户ID',
  upload_date DATE NOT NULL COMMENT '统计日期',
  total_bytes BIGINT NOT NULL DEFAULT 0 COMMENT '当日累计上传字节数',
  upload_count INT NOT NULL DEFAULT 0 COMMENT '当日累计上传文件数',
  last_uploaded_at DATETIME DEFAULT NULL COMMENT '最近上传时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_user_upload_daily_stats (user_id, upload_date),
  INDEX idx_user_upload_daily_stats_date (upload_date, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 七、后台管理
-- ================================================================

-- 管理员操作日志表：后台关键治理动作留痕（含变更前后快照）
CREATE TABLE IF NOT EXISTS admin_operation_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员操作日志ID',
  operator_user_id INT DEFAULT NULL COMMENT '操作管理员ID',
  operator_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '操作管理员名称',
  module VARCHAR(50) NOT NULL DEFAULT '' COMMENT '所属模块',
  action VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作动作',
  target_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作对象类型',
  target_id INT DEFAULT NULL COMMENT '操作对象ID',
  target_label VARCHAR(255) NOT NULL DEFAULT '' COMMENT '操作对象展示文案',
  before_snapshot LONGTEXT COMMENT '变更前快照JSON',
  after_snapshot LONGTEXT COMMENT '变更后快照JSON',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_admin_operation_logs_created_at (created_at, id),
  INDEX idx_admin_operation_logs_operator (operator_user_id, id),
  INDEX idx_admin_operation_logs_module (module, id),
  INDEX idx_admin_operation_logs_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 平台业务配置表：单例 JSON 配置（后台「业务配置」页）
-- 注意：加字段须同步 runtime.js / admin.routes.js / 前端镜像，漏一处会被 PUT 静默清掉
CREATE TABLE IF NOT EXISTS admin_business_settings (
  id TINYINT PRIMARY KEY COMMENT '单例配置ID',
  settings_json LONGTEXT NOT NULL COMMENT '平台业务参数JSON',
  updated_by_user_id INT DEFAULT NULL COMMENT '最后更新管理员ID',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_admin_business_settings_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 在线人数快照表：定时采样当前在线用户数
CREATE TABLE IF NOT EXISTS admin_online_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '在线人数快照ID',
  current_online_users INT NOT NULL DEFAULT 0 COMMENT '采样时当前在线用户数',
  snapshot_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采样时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_admin_online_snapshots_snapshot_at (snapshot_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================
-- 八、历史遗留表（当前代码零引用，仅生产库存量数据，勿在新功能中使用）
-- ================================================================

-- 遗留：汇付操作日志表（已被 payment_transactions/payment_refunds 等表替代）
CREATE TABLE IF NOT EXISTS huifu_operation_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '汇付操作日志ID',
  user_id INT DEFAULT NULL COMMENT '关联用户ID',
  order_id INT DEFAULT NULL COMMENT '关联订单ID',
  operation_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作类型',
  request_no VARCHAR(100) DEFAULT NULL COMMENT '平台请求号',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '汇付请求号',
  provider_status VARCHAR(50) DEFAULT NULL COMMENT '汇付状态',
  provider_code VARCHAR(32) DEFAULT NULL COMMENT '汇付响应码',
  provider_message VARCHAR(255) DEFAULT NULL COMMENT '汇付响应描述',
  request_payload LONGTEXT COMMENT '请求报文',
  response_payload LONGTEXT COMMENT '响应报文',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_huifu_operation_logs_user_id (user_id, id),
  INDEX idx_huifu_operation_logs_order_id (order_id, id),
  INDEX idx_huifu_operation_logs_request_no (request_no),
  INDEX idx_huifu_operation_logs_operation_type (operation_type, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 遗留：实名认证记录表（实名快照已内联到 users.kyc_* 列）
CREATE TABLE IF NOT EXISTS user_kyc_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '实名认证记录ID',
  user_id INT NOT NULL COMMENT '用户ID',
  real_name VARCHAR(50) NOT NULL COMMENT '实名姓名',
  real_name_masked VARCHAR(50) DEFAULT NULL COMMENT '脱敏后的实名姓名',
  id_card_masked VARCHAR(40) NOT NULL COMMENT '脱敏后的证件号',
  id_card_hash CHAR(64) NOT NULL COMMENT '证件号摘要',
  status ENUM('pending','verified','failed') NOT NULL DEFAULT 'pending' COMMENT '实名状态',
  provider VARCHAR(50) NOT NULL DEFAULT 'disabled' COMMENT '实名服务商',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商请求单号',
  provider_response_code VARCHAR(32) DEFAULT NULL COMMENT '服务商响应码',
  provider_response_desc VARCHAR(255) DEFAULT NULL COMMENT '服务商响应描述',
  order_no VARCHAR(64) DEFAULT NULL COMMENT '平台侧实名订单号',
  biz_token VARCHAR(128) DEFAULT NULL COMMENT '服务商核身流程标识',
  verify_url VARCHAR(1024) DEFAULT NULL COMMENT '核身跳转地址',
  rule_id VARCHAR(64) DEFAULT NULL COMMENT '核身业务流程ID',
  biz_seq_no VARCHAR(128) DEFAULT NULL COMMENT '服务商业务流水号',
  request_id VARCHAR(128) DEFAULT NULL COMMENT '服务商请求ID',
  similarity DECIMAL(6,2) DEFAULT NULL COMMENT '人脸比对分',
  live_rate DECIMAL(6,2) DEFAULT NULL COMMENT '活体得分',
  completed_at DATETIME DEFAULT NULL COMMENT '实名流程完成时间',
  failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
  huifu_id VARCHAR(64) DEFAULT NULL COMMENT '汇付子商户号',
  card_token_no VARCHAR(128) DEFAULT NULL COMMENT '汇付结算卡标识',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  verified_at DATETIME DEFAULT NULL COMMENT '通过时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_user_kyc_records_provider_request_id (provider_request_id),
  INDEX idx_user_kyc_records_user_id (user_id, id),
  INDEX idx_user_kyc_records_status (status, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 遗留：提现申请表（已被 encashments 取现单替代）
CREATE TABLE IF NOT EXISTS wallet_withdraw_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '提现申请ID',
  request_no VARCHAR(40) NOT NULL COMMENT '平台提现单号',
  user_id INT NOT NULL COMMENT '提现用户ID',
  channel VARCHAR(30) NOT NULL DEFAULT 'alipay' COMMENT '提现渠道',
  provider VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT '代付服务商',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '申请提现金额（分）',
  fee_amount BIGINT NOT NULL DEFAULT 0 COMMENT '手续费（分）',
  net_amount BIGINT NOT NULL DEFAULT 0 COMMENT '到账金额（分）',
  status ENUM('pending_review','processing','success','failed','rejected','cancelled') NOT NULL DEFAULT 'pending_review' COMMENT '提现状态',
  account_name VARCHAR(80) NOT NULL DEFAULT '' COMMENT '收款账户姓名',
  account_no_masked VARCHAR(120) NOT NULL DEFAULT '' COMMENT '脱敏后的收款账号',
  account_snapshot_json LONGTEXT COMMENT '收款账户快照JSON，后续可替换为加密密文',
  provider_request_id VARCHAR(100) DEFAULT NULL COMMENT '服务商打款单号',
  provider_payload LONGTEXT COMMENT '服务商响应JSON',
  remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
  failure_reason VARCHAR(255) DEFAULT NULL COMMENT '失败原因',
  reviewed_by_user_id INT DEFAULT NULL COMMENT '审核管理员ID',
  reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
  paid_at DATETIME DEFAULT NULL COMMENT '打款完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE INDEX uk_wallet_withdraw_requests_no (request_no),
  INDEX idx_wallet_withdraw_requests_user_id (user_id, id),
  INDEX idx_wallet_withdraw_requests_status (status, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
