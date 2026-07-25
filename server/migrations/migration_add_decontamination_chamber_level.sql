-- Migration that adds listing decontamination chamber level support.

ALTER TABLE listings
  ADD COLUMN decontamination_chamber_level TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '洗消舱等级（0-3）' AFTER dive_level;
