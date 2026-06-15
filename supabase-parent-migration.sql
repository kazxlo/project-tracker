-- ============================================
-- 父子项目字段迁移 SQL
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================

-- 添加 parent_id / description / service_start / service_end 字段
ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_start TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_end TEXT;

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
