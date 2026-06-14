-- ============================================
-- 项目可见性权限升级 SQL
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================

-- 1. 添加 viewer_ids 字段到 projects 表
ALTER TABLE projects ADD COLUMN IF NOT EXISTS viewer_ids TEXT[] DEFAULT NULL;

-- 2. 删除旧的 RLS 策略（需重建以加入 viewer 逻辑）
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "reports_select" ON weekly_reports;

-- 3. projects 新 select 策略：无限制(NULL)或viewer_ids包含当前用户或admin
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated 
  USING (
    viewer_ids IS NULL 
    OR auth.uid() = ANY(viewer_ids) 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. weekly_reports 新 select 策略：关联projects的viewer检查
CREATE POLICY "reports_select" ON weekly_reports FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = weekly_reports.project_id 
      AND (
        projects.viewer_ids IS NULL 
        OR auth.uid() = ANY(projects.viewer_ids)
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

-- 5. 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
