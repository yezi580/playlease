-- Migration that adds listing compensation plan support.

ALTER TABLE listings
  ADD COLUMN compensation_plan VARCHAR(20) NOT NULL DEFAULT 'basic' COMMENT '保险赔付方案（premium/medium/basic）' AFTER insurance_level;
