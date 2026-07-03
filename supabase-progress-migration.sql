-- ============================================
-- 项目进度字段迁移 SQL
-- 在 projects 表中添加 progress 列（0-100）
-- 子项目无周报时作为进度兜底数据
-- ============================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
