-- ============================================================
-- 本地 dev 演示数据(非生产):4 个卖家用户 + 12 个上架中商品
-- 用法: node deploy/mysql/gen-demo-images.cjs   (先生成 public/demo-img/)
--       docker exec -i my-app-dev-mysql-1 mysql -uroot -p<密码> \
--         --default-character-set=utf8mb4 game_rental < seed-demo-data.sql
-- 幂等性: 先 DELETE 演示数据再插入,可重复执行;
--          用户/商品 ID 通过手机号与 listing_no 反查,不依赖自增值。
-- ============================================================

-- ---------- 清理旧演示数据 ----------
DELETE FROM listing_hot_stats WHERE listing_id IN (SELECT id FROM listings WHERE listing_no LIKE '20260922%');
DELETE FROM listing_images WHERE listing_id IN (SELECT id FROM listings WHERE listing_no LIKE '20260922%');
DELETE FROM listing_items WHERE listing_id IN (SELECT id FROM listings WHERE listing_no LIKE '20260922%');
DELETE FROM listings WHERE listing_no LIKE '20260922%';
DELETE FROM users WHERE phone IN ('18500006601', '18600006602', '18700006603', '18800006604', '18900006605', '19900006606');

-- ---------- 卖家用户 ----------
INSERT INTO users (username, password_hash, phone, role, invite_code, kyc_status, created_at) VALUES
('185****6601', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '18500006601', 'user', 'DM000001', 'verified', NOW() - INTERVAL 40 DAY),
('186****6602', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '18600006602', 'user', 'DM000002', 'verified', NOW() - INTERVAL 35 DAY),
('187****6603', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '18700006603', 'user', 'DM000003', 'verified', NOW() - INTERVAL 28 DAY),
('188****6604', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '18800006604', 'user', 'DM000004', 'verified', NOW() - INTERVAL 21 DAY);

SET @u1 = (SELECT id FROM users WHERE phone = '18500006601');
SET @u2 = (SELECT id FROM users WHERE phone = '18600006602');
SET @u3 = (SELECT id FROM users WHERE phone = '18700006603');
SET @u4 = (SELECT id FROM users WHERE phone = '18800006604');

-- ---------- 客服与管理员演示账号（登录：手机号 + 固定验证码 123456） ----------
DELETE FROM users WHERE phone IN ('18900006605', '19900006606');
INSERT INTO users (username, password_hash, phone, role, invite_code, kyc_status, created_at) VALUES
('客服-演示', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '18900006605', 'support', 'DM000005', 'verified', NOW() - INTERVAL 30 DAY),
('演示管理员', '$2b$10$hzwci./QodZZVpNusEURK.OdHR32ZWWWJSr/DogFhGrXv1JRGf0Pa', '19900006606', 'admin', 'DM000006', 'verified', NOW() - INTERVAL 30 DAY);

-- ---------- 商品(金额单位:分;图片为本地图,先跑 gen-demo-images.cjs) ----------
INSERT INTO listings
(listing_no, owner_user_id, owner_name, seller_contact_wechat, listing_status, review_status, reviewed_at, published_at,
 insurance_level, compensation_plan, energy_level, weight_level, dive_level, decontamination_chamber_level,
 login_method, login_time_range, daily_cost, base_ratio, rent_days, hafu_coin, secret_kd, rank_name, character_level,
 region, face_verified, seyed_unlocked, ban_record, operator_appearance, gold_skin, knife_skin, weapon_skin,
 deposit, rent_price, remark, cover_image, created_at)
VALUES
('202609220001', @u1, '185****6601', 'demo_wechat_01', 'active', 'approved', NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 20 DAY,
 '9格', 'premium', '6级', '6级', 3, 3, 'QQ账密', '09:00-23:00', 120, 45, 7, 260, 4.2, '巅峰', 60,
 '广东深圳', 1, 1, 0, '红狼-蚀金玫瑰', '全干员金皮', '赤枭', 'M4A1-棱镜攻势',
 20000, 8800, '巅峰段位满配号,哈夫币充足,绝密KD漂亮,长期可租,可看视频验号。', '/demo-img/xysh01a.svg', NOW() - INTERVAL 20 DAY),
('202609220002', @u1, '185****6601', 'demo_wechat_01', 'active', 'approved', NOW() - INTERVAL 19 DAY, NOW() - INTERVAL 19 DAY,
 '6格', 'medium', '5级', '5级', 2, 2, '微信扫码', '10:00-22:00', 90, 40, 5, 180, 3.5, '黑鹰', 60,
 '广东广州', 1, 1, 0, '威龙-凌霄戍卫', '部分金皮', '怜悯', '维克托-美杜莎',
 12000, 5000, '黑鹰段位,装备齐全,支持中途上号查看,可小刀。', '/demo-img/xysh02a.svg', NOW() - INTERVAL 19 DAY),
('202609220003', @u2, '186****6602', 'demo_wechat_02', 'active', 'approved', NOW() - INTERVAL 18 DAY, NOW() - INTERVAL 18 DAY,
 '9格', 'premium', '7级', '7级', 3, 3, 'QQ账密', '08:00-24:00', 150, 48, 10, 320, 3.8, '钻石', 60,
 '北京朝阳', 1, 1, 0, '骇爪-水墨云图', '全干员金皮', '影锋', 'SCAR-H-电玩高手',
 25000, 9900, '钻石一,稳定输出,大红收藏品多,适合上分和搬砖。', '/demo-img/xysh03a.svg', NOW() - INTERVAL 18 DAY),
('202609220004', @u2, '186****6602', 'demo_wechat_02', 'active', 'approved', NOW() - INTERVAL 17 DAY, NOW() - INTERVAL 17 DAY,
 '4格', 'basic', '4级', '4级', 1, 1, 'steam国服', '12:00-22:00', 60, 35, 3, 80, 5.1, '黄金', 60,
 '上海浦东', 0, 0, 0, NULL, NULL, NULL, NULL,
 6000, 2600, '小号便宜租,适合做任务,押金低。', '/demo-img/xysh04a.svg', NOW() - INTERVAL 17 DAY),
('202609220005', @u3, '187****6603', 'demo_wechat_03', 'active', 'approved', NOW() - INTERVAL 16 DAY, NOW() - INTERVAL 16 DAY,
 '6格', 'medium', '5级', '6级', 2, 3, '微信扫码', '09:00-23:00', 100, 42, 7, 150, 4.0, '铂金', 60,
 '四川成都', 1, 0, 0, '露娜-黑·天际线', NULL, '黑海', 'QBZ95-王牌命运',
 10000, 4500, '铂金段位性价比之选,时间灵活可协商。', '/demo-img/xysh05a.svg', NOW() - INTERVAL 16 DAY),
('202609220006', @u3, '187****6603', 'demo_wechat_03', 'active', 'approved', NOW() - INTERVAL 15 DAY, NOW() - INTERVAL 15 DAY,
 '9格', 'premium', '7级', '7级', 3, 3, 'QQ账密', '全天', 140, 47, 14, 300, 3.2, '巅峰', 60,
 '浙江杭州', 1, 1, 0, '佐娅-能天使', '全干员金皮', '北极星', '腾龙-气象感应',
 22000, 9500, '巅峰大佬号,零封禁记录,支持任意验证,长租优惠。', '/demo-img/xysh06a.svg', NOW() - INTERVAL 15 DAY),
('202609220007', @u4, '188****6604', 'demo_wechat_04', 'active', 'approved', NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 14 DAY,
 '2格', 'basic', '4级', '5级', 1, 2, 'steam国际服', '14:00-23:00', 50, 30, 3, 60, 6.0, '白银', 60,
 '湖北武汉', 0, 0, 0, NULL, NULL, NULL, NULL,
 4000, 2000, '白菜价小号,日租低价,适合休闲玩家体验。', '/demo-img/xysh07a.svg', NOW() - INTERVAL 14 DAY),
('202609220008', @u4, '188****6604', 'demo_wechat_04', 'active', 'approved', NOW() - INTERVAL 13 DAY, NOW() - INTERVAL 13 DAY,
 '6格', 'medium', '6级', '5级', 2, 2, 'QQ账密', '09:00-22:00', 95, 41, 5, 170, 4.5, '钻石', 60,
 '江苏南京', 1, 1, 0, '威龙-蛟龙特战队', NULL, '信条', 'K416-王牌命运',
 13000, 5200, '钻石号稳定,安全箱6格,常年在线,售后秒回。', '/demo-img/xysh08a.svg', NOW() - INTERVAL 13 DAY),
('202609220009', @u1, '185****6601', 'demo_wechat_01', 'active', 'approved', NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 12 DAY,
 '4格', 'basic', '5级', '4级', 1, 1, '微信扫码', '10:00-20:00', 70, 36, 3, 90, 5.5, '黄金', 60,
 '陕西西安', 0, 1, 0, NULL, NULL, '龙牙', NULL,
 7000, 3000, '黄金段位过渡号,价格实惠。', '/demo-img/xysh09a.svg', NOW() - INTERVAL 12 DAY),
('202609220010', @u2, '186****6602', 'demo_wechat_02', 'active', 'approved', NOW() - INTERVAL 11 DAY, NOW() - INTERVAL 11 DAY,
 '9格', 'premium', '6级', '7级', 3, 3, 'QQ账密', '08:00-23:00', 130, 46, 10, 280, 3.9, '黑鹰', 60,
 '福建厦门', 1, 1, 0, '骇爪-维什戴尔', '热门金皮', '暗星', 'M4A1-棱镜攻势',
 18000, 8200, '黑鹰守门号,武器皮肤齐全,绝密KD 3.9。', '/demo-img/xysh10a.svg', NOW() - INTERVAL 11 DAY),
('202609220011', @u3, '187****6603', 'demo_wechat_03', 'active', 'approved', NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 10 DAY,
 '6格', 'medium', '5级', '5级', 2, 2, 'steam国服', '11:00-23:00', 85, 39, 5, 140, 4.8, '铂金', 60,
 '山东青岛', 1, 0, 1, NULL, NULL, '坠星者', '维克托-美杜莎',
 11000, 4800, '历史封禁已过期(附处罚截图),价格已让利,介意慎拍。', '/demo-img/xysh11a.svg', NOW() - INTERVAL 10 DAY),
('202609220012', @u4, '188****6604', 'demo_wechat_04', 'active', 'approved', NOW() - INTERVAL 9 DAY, NOW() - INTERVAL 9 DAY,
 '9格', 'premium', '7级', '6级', 3, 3, 'QQ账密', '全天', 145, 44, 15, 340, 3.0, '巅峰', 60,
 '广东深圳', 1, 1, 0, '威龙-吴彦祖联动', '全干员金皮', '挽歌', 'SCAR-H-电玩高手',
 26000, 10500, '顶配巅峰号,哈夫币340M,长租包周优惠,速来。', '/demo-img/xysh12a.svg', NOW() - INTERVAL 9 DAY);

SET @l1  = (SELECT id FROM listings WHERE listing_no = '202609220001');
SET @l2  = (SELECT id FROM listings WHERE listing_no = '202609220002');
SET @l3  = (SELECT id FROM listings WHERE listing_no = '202609220003');
SET @l4  = (SELECT id FROM listings WHERE listing_no = '202609220004');
SET @l5  = (SELECT id FROM listings WHERE listing_no = '202609220005');
SET @l6  = (SELECT id FROM listings WHERE listing_no = '202609220006');
SET @l7  = (SELECT id FROM listings WHERE listing_no = '202609220007');
SET @l8  = (SELECT id FROM listings WHERE listing_no = '202609220008');
SET @l9  = (SELECT id FROM listings WHERE listing_no = '202609220009');
SET @l10 = (SELECT id FROM listings WHERE listing_no = '202609220010');
SET @l11 = (SELECT id FROM listings WHERE listing_no = '202609220011');
SET @l12 = (SELECT id FROM listings WHERE listing_no = '202609220012');

-- ---------- 商品图(每个 2 张,本地图) ----------
INSERT INTO listing_images (listing_id, image_url, sort_order) VALUES
(@l1, '/demo-img/xysh01a.svg', 0), (@l1, '/demo-img/xysh01b.svg', 1),
(@l2, '/demo-img/xysh02a.svg', 0), (@l2, '/demo-img/xysh02b.svg', 1),
(@l3, '/demo-img/xysh03a.svg', 0), (@l3, '/demo-img/xysh03b.svg', 1),
(@l4, '/demo-img/xysh04a.svg', 0), (@l4, '/demo-img/xysh04b.svg', 1),
(@l5, '/demo-img/xysh05a.svg', 0), (@l5, '/demo-img/xysh05b.svg', 1),
(@l6, '/demo-img/xysh06a.svg', 0), (@l6, '/demo-img/xysh06b.svg', 1),
(@l7, '/demo-img/xysh07a.svg', 0), (@l7, '/demo-img/xysh07b.svg', 1),
(@l8, '/demo-img/xysh08a.svg', 0), (@l8, '/demo-img/xysh08b.svg', 1),
(@l9, '/demo-img/xysh09a.svg', 0), (@l9, '/demo-img/xysh09b.svg', 1),
(@l10, '/demo-img/xysh10a.svg', 0), (@l10, '/demo-img/xysh10b.svg', 1),
(@l11, '/demo-img/xysh11a.svg', 0), (@l11, '/demo-img/xysh11b.svg', 1),
(@l12, '/demo-img/xysh12a.svg', 0), (@l12, '/demo-img/xysh12b.svg', 1);

-- ---------- 额外物品(演示双边定价的物品快照来源) ----------
INSERT INTO listing_items (listing_id, item_key, item_name, item_mode, quantity, unit_price, total_price) VALUES
(@l1, 'topCard', '大红顶级收藏卡', 'sale', 2, 8000, 16000),
(@l3, 'awmBullet', 'AWM 子弹组', 'sale', 3, 1500, 4500),
(@l6, 'topCard', '大红顶级收藏卡', 'gift', 1, NULL, NULL),
(@l12, 'awmBullet', 'AWM 子弹组', 'sale', 5, 1200, 6000);

-- ---------- 热度(7 日独立点击,影响首页热度排序) ----------
INSERT INTO listing_hot_stats (listing_id, unique_click_7d) VALUES
(@l1, 520), (@l2, 233), (@l3, 411), (@l4, 88), (@l5, 190), (@l6, 466),
(@l7, 61), (@l8, 275), (@l9, 102), (@l10, 358), (@l11, 143), (@l12, 489);
