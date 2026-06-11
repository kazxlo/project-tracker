-- ============================================
-- 项目截止时间字段迁移 SQL
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================

-- 添加 deadline 相关字段到 projects 表
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline_extensions INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_deadline TEXT;

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
