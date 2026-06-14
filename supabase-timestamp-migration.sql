-- ============================================
-- 周报时间戳字段迁移 SQL
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================

-- 添加 created_at / updated_at 字段（如不存在）
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 为已有数据填充默认值（空字段设为当前时间）
UPDATE weekly_reports SET created_at = now() WHERE created_at IS NULL;
UPDATE weekly_reports SET updated_at = now() WHERE updated_at IS NULL;

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
