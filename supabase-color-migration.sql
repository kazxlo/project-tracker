-- 项目颜色迁移：旧调色板 → 新调色板
-- 执行前请备份数据！
-- 反向迁移：将新色值替换为旧色值即可回退

-- 天蓝（原蓝）
UPDATE projects SET color = '#5B9EF5' WHERE color = '#378ADD';

-- 翠绿（原绿）
UPDATE projects SET color = '#4ADE80' WHERE color = '#639922';

-- 琥珀橙（原橙，避开红色以防与警示色冲突）
UPDATE projects SET color = '#FB923C' WHERE color = '#D85A30';

-- 薰衣紫（原紫）
UPDATE projects SET color = '#A78BFA' WHERE color = '#7F77DD';

-- 薄荷青（原青）
UPDATE projects SET color = '#2DD4BF' WHERE color = '#3DA5A5';

-- 金黄（原棕橙）
UPDATE projects SET color = '#FBBF24' WHERE color = '#D4834A';

-- 玫粉（原玫紫）
UPDATE projects SET color = '#F472B6' WHERE color = '#B05E99';

-- 浅蓝（原浅蓝）
UPDATE projects SET color = '#60A5FA' WHERE color = '#5B8DD6';
