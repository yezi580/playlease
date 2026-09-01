-- ========================================
-- 租号网站数据库表结构定义（已合并 migration_fix_varchar_to_numeric.sql）
-- 包含：用户表、商品表、商品物品表、商品图片表
-- 执行方式：mysql -u root -p game_rental < schema.sql
-- ========================================

CREATE DATABASE IF NOT EXISTS game_rental DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE game_rental;

-- 用户表：存储注册用户的账号信息（手机号+密码登录模式）
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户唯一ID',
  username VARCHAR(50) NOT NULL COMMENT '显示名称（自动从手机号生成，如138****1234）',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt加密后的密码哈希',
  phone VARCHAR(20) NOT NULL UNIQUE COMMENT '手机号（唯一，作为登录标识）',
  role ENUM('user','support','admin') NOT NULL DEFAULT 'user' COMMENT '角色：普通用户/客服/管理员',
  banned_until DATETIME DEFAULT NULL COMMENT '封禁截止时间，为空表示未封禁',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品列表表：存储每个出租账号的完整信息
CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '商品唯一ID',
  listing_no VARCHAR(20) DEFAULT NULL COMMENT '商品编号（年月日+4位随机数，如202605191652）',
  owner_user_id INT NOT NULL COMMENT '发布人用户ID，用于个人中心查询我发布的商品',
  owner_name VARCHAR(100) NOT NULL COMMENT '发布者显示名（如138****1234）',
  listing_status ENUM('active', 'inactive', 'pending_review', 'sold_out', 'rented') NOT NULL DEFAULT 'active' COMMENT '商品状态：上架中/已下架/审核中/已售出/已租出',
  review_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' COMMENT '审核状态：待审/通过/驳回',
  reviewed_by INT DEFAULT NULL COMMENT '最后审核管理员ID',
  reviewed_at DATETIME DEFAULT NULL COMMENT '最后审核时间',
  review_reason VARCHAR(500) DEFAULT NULL COMMENT '审核备注或驳回原因',
  review_assignee_id INT DEFAULT NULL COMMENT '派给的客服ID（商品审核工单）',
  review_assigned_at DATETIME DEFAULT NULL COMMENT '派单时间',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间（DATETIME格式）',

  -- 基础属性
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

  -- 账号属性
  hafu_coin BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '哈夫币余额(M，整数)',
  secret_kd DECIMAL(4,1) NOT NULL DEFAULT 0.0 COMMENT '绝密KD（允许1位小数）',
  rank_name VARCHAR(30) NOT NULL DEFAULT '' COMMENT '段位名称',
  character_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '角色等级（固定60级满级）',
  region VARCHAR(80) NOT NULL DEFAULT '' COMMENT '所在地区',

  -- 验证状态
  face_verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '人脸归属本人（0否/1是）',
  ban_record TINYINT(1) NOT NULL DEFAULT 0 COMMENT '封禁记录（0无/1有）',
  ban_video_url VARCHAR(500) DEFAULT NULL COMMENT '无封禁记录视频URL',

  -- 外观资产
  operator_appearance VARCHAR(200) DEFAULT NULL COMMENT '干员外观描述',
  gold_skin VARCHAR(200) DEFAULT NULL COMMENT '人物金皮描述',
  knife_skin VARCHAR(200) DEFAULT NULL COMMENT '持有刀皮描述',
  weapon_skin VARCHAR(200) DEFAULT NULL COMMENT '武器皮肤描述',

  -- 价格信息（单位：分，避免浮点精度问题）
  deposit BIGINT NOT NULL DEFAULT 0 COMMENT '押金（分为单位）',
  rent_price BIGINT NOT NULL DEFAULT 0 COMMENT '租金（分为单位）',

  -- 其他
  remark TEXT COMMENT '商品备注说明',
  cover_image VARCHAR(500) DEFAULT NULL COMMENT '封面图URL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_listings_owner_user_id (owner_user_id),
  UNIQUE INDEX uk_listings_listing_no (listing_no),
  INDEX idx_listings_status (listing_status),
  INDEX idx_listings_status_created (listing_status, created_at),
  INDEX idx_listings_owner_status (owner_user_id, listing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理员操作日志表：记录后台关键治理动作
CREATE TABLE IF NOT EXISTS admin_operation_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '管理员操作日志ID',
  operator_user_id INT DEFAULT NULL COMMENT '操作管理员ID',
  operator_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '操作管理员名称',
  module VARCHAR(50) NOT NULL DEFAULT '' COMMENT '所属模块',
  action VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作动作',
  target_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作对象类型',
  target_id INT DEFAULT NULL COMMENT '操作对象ID',
  target_label VARCHAR(255) NOT NULL DEFAULT '' COMMENT '操作对象展示文案',
  before_snapshot LONGTEXT DEFAULT NULL COMMENT '变更前快照JSON',
  after_snapshot LONGTEXT DEFAULT NULL COMMENT '变更后快照JSON',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_admin_operation_logs_created_at (created_at, id),
  INDEX idx_admin_operation_logs_operator (operator_user_id, id),
  INDEX idx_admin_operation_logs_module (module, id),
  INDEX idx_admin_operation_logs_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户问题反馈表：存储前台用户提交的问题与管理员处理结果
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
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (handled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_feedback_user_created (user_id, created_at, id),
  INDEX idx_user_feedback_status_created (status, created_at, id),
  INDEX idx_user_feedback_category_created (category_code, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品点击去重表：用于统计近7天独立点击用户数
CREATE TABLE IF NOT EXISTS listing_click_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '记录ID',
  listing_id INT NOT NULL COMMENT '商品ID',
  user_id INT NOT NULL COMMENT '点击用户ID',
  first_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次点击时间',
  last_clicked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次点击时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX uk_listing_click_users_listing_user (listing_id, user_id),
  INDEX idx_listing_click_users_last_clicked_listing (last_clicked_at, listing_id),
  INDEX idx_listing_click_users_listing_last_clicked (listing_id, last_clicked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品 7 日热度预聚合表：由定时任务周期刷新，商品列表接口直接 JOIN 使用
CREATE TABLE IF NOT EXISTS listing_hot_stats (
  listing_id INT NOT NULL COMMENT '商品ID',
  unique_click_7d INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '近7天独立访客点击数（周期预聚合）',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后聚合时间',
  PRIMARY KEY (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品物品表：存储每个商品包含的额外物品详情及其处理方式（一对多关系）
CREATE TABLE IF NOT EXISTS listing_items (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  item_key VARCHAR(40) NOT NULL COMMENT '道具标识符（如 topCard / awmBullet）',
  item_name VARCHAR(120) NOT NULL COMMENT '道具显示名称',
  item_mode ENUM('sale', 'gift') NOT NULL DEFAULT 'sale' COMMENT '额外物品处理方式：出售/赠送',
  quantity INT UNSIGNED DEFAULT NULL COMMENT '数量（正整数）',
  unit_price BIGINT DEFAULT NULL COMMENT '单价（分为单位，整数）',
  total_price BIGINT DEFAULT NULL COMMENT '总价（分为单位，整数）',
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  INDEX idx_listing_id (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品图片表：存储商品的展示图片（一对多关系）
CREATE TABLE IF NOT EXISTS listing_images (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  image_url LONGTEXT NOT NULL COMMENT '图片URL或Base64数据',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  INDEX idx_listing_id (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品封禁截图表：存储封禁记录截图（一对多关系）
CREATE TABLE IF NOT EXISTS listing_ban_images (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  listing_id INT NOT NULL COMMENT '关联的商品ID',
  image_url VARCHAR(500) NOT NULL COMMENT '处罚截图URL',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号（小的在前）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  INDEX idx_listing_ban_images_listing_id (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单表：存储用户下单后的交易记录（当前用于“我的订单”列表和状态筛选）
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订单唯一ID',
  order_no VARCHAR(40) NOT NULL UNIQUE COMMENT '订单编号',
  buyer_id INT NOT NULL COMMENT '下单用户ID',
  seller_id INT DEFAULT NULL COMMENT '卖家用户ID，用于卖家视角订单查询',
  listing_id INT NOT NULL COMMENT '关联商品ID',
  seller_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '卖家名称快照',
  listing_title VARCHAR(200) NOT NULL DEFAULT '' COMMENT '商品标题快照',
  listing_cover_image VARCHAR(500) DEFAULT NULL COMMENT '商品封面快照',
  rent_days TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '租用天数',
  seller_rent_amount BIGINT NOT NULL DEFAULT 0 COMMENT '卖家发布租金快照（分）',
  amount BIGINT NOT NULL DEFAULT 0 COMMENT '订单金额（分为单位）',
  deposit_amount BIGINT NOT NULL DEFAULT 0 COMMENT '押金金额（分为单位）',
  status ENUM(
    'pending_payment',
    'paid',
    'support_handling',
    'settlement_pending',
    'deposit_holding',
    'completed',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_payment' COMMENT '订单状态：待付款/已支付/客服处理中/待结算/押金保管中/已完成/已取消（与生产一致，历史状态由 app.js 启动迁移归并）',
  after_sale_reason VARCHAR(500) DEFAULT NULL COMMENT '售后原因展示文案',
  after_sale_reason_code VARCHAR(50) DEFAULT NULL COMMENT '售后原因代码',
  after_sale_note VARCHAR(500) DEFAULT NULL COMMENT '售后补充说明',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间',
  paid_at DATETIME DEFAULT NULL COMMENT '支付时间',
  finished_at DATETIME DEFAULT NULL COMMENT '完成时间',
  cancelled_at DATETIME DEFAULT NULL COMMENT '取消时间',
  after_sale_at DATETIME DEFAULT NULL COMMENT '发起售后时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT,
  INDEX idx_orders_buyer_id (buyer_id),
  INDEX idx_orders_seller_id (seller_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_status_created (status, created_at),
  INDEX idx_orders_status_paid (status, paid_at),
  INDEX idx_orders_buyer_status (buyer_id, status),
  INDEX idx_orders_seller_status (seller_id, status),
  INDEX idx_orders_listing_id (listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 押金保管表：结单后押金进入冷静期保管，到期自动退回买家；期间卖家可举报买家违规，客服裁决没收赔付卖家或驳回退买家
CREATE TABLE IF NOT EXISTS order_deposit_holds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '押金保管记录ID',
  order_id INT NOT NULL COMMENT '关联订单ID',
  buyer_id INT NOT NULL COMMENT '买家用户ID',
  seller_id INT NOT NULL COMMENT '卖家用户ID',
  hold_amount BIGINT NOT NULL DEFAULT 0 COMMENT '保管中的押金金额（分）',
  status ENUM('holding', 'disputed', 'releasing', 'released', 'confiscating', 'confiscated') NOT NULL DEFAULT 'holding' COMMENT '保管状态',
  hold_days INT NOT NULL DEFAULT 3 COMMENT '保管天数（结算时点的冷静期配置快照）',
  release_at DATETIME NOT NULL COMMENT '预计自动退回时间',
  released_at DATETIME DEFAULT NULL COMMENT '实际退回买家时间',
  reported_at DATETIME DEFAULT NULL COMMENT '卖家举报时间',
  report_reason VARCHAR(500) DEFAULT NULL COMMENT '卖家举报原因',
  verdict ENUM('refund', 'confiscate') DEFAULT NULL COMMENT '客服裁决结果',
  verdict_note VARCHAR(500) DEFAULT NULL COMMENT '客服裁决说明',
  verdict_by_support_id INT DEFAULT NULL COMMENT '裁决客服ID',
  verdict_at DATETIME DEFAULT NULL COMMENT '裁决时间',
  refund_reason VARCHAR(255) DEFAULT NULL COMMENT '退买家退款流水幂等 reason',
  payout_remark VARCHAR(255) DEFAULT NULL COMMENT '赔卖家打款流水幂等 remark',
  payout_mode ENUM('huifu', 'manual') NOT NULL DEFAULT 'huifu' COMMENT '赔付卖家支付方式',
  manual_payout_note VARCHAR(500) DEFAULT NULL COMMENT '线下赔付备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE INDEX uk_order_deposit_holds_order_id (order_id),
  INDEX idx_order_deposit_holds_status_release (status, release_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话表：存储订单沟通会话
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '会话唯一ID',
  type ENUM('order') NOT NULL DEFAULT 'order' COMMENT '会话类型',
  ref_id INT NOT NULL COMMENT '关联业务ID，当前为订单ID',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '会话标题',
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active' COMMENT '会话状态',
  last_message_preview VARCHAR(255) DEFAULT NULL COMMENT '最后一条消息预览',
  last_message_at DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE INDEX uk_conversations_type_ref (type, ref_id),
  INDEX idx_conversations_last_message_at (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话参与人表：存储会话成员和已读进度
CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  user_id INT NOT NULL COMMENT '参与人用户ID',
  role ENUM('buyer', 'seller', 'support') NOT NULL DEFAULT 'buyer' COMMENT '会话角色',
  last_read_message_id INT DEFAULT NULL COMMENT '最后已读消息ID',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX uk_conversation_participants_user (conversation_id, user_id),
  INDEX idx_conversation_participants_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话消息表：存储聊天消息
CREATE TABLE IF NOT EXISTS conversation_messages (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '消息唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  sender_user_id INT NOT NULL COMMENT '发送人用户ID',
  message_type ENUM('text', 'system') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  content TEXT NOT NULL COMMENT '消息内容',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation_messages_conversation (conversation_id, id),
  INDEX idx_conversation_messages_sender (sender_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
