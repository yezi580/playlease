-- 给 listing_status ENUM 添加 'rented' 状态
-- 当有人下单但未支付/进行中/售后中时，商品状态为 'rented'（已租出）
-- 订单取消或完成后恢复为 'active'
ALTER TABLE listings
  MODIFY COLUMN listing_status ENUM('active', 'inactive', 'pending_review', 'sold_out', 'rented') NOT NULL DEFAULT 'active'
  COMMENT '商品状态：上架中/已下架/审核中/已售出/已租出';
