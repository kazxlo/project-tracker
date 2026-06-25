-- ============================================================
-- 里程碑 & 项目任务 RLS 策略补充
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================================

-- 1. 清理旧策略（如果存在）
DROP POLICY IF EXISTS "milestones_select" ON milestones;
DROP POLICY IF EXISTS "milestones_insert" ON milestones;
DROP POLICY IF EXISTS "milestones_update" ON milestones;
DROP POLICY IF EXISTS "milestones_delete" ON milestones;

DROP POLICY IF EXISTS "project_tasks_select" ON project_tasks;
DROP POLICY IF EXISTS "project_tasks_insert" ON project_tasks;
DROP POLICY IF EXISTS "project_tasks_update" ON project_tasks;
DROP POLICY IF EXISTS "project_tasks_delete" ON project_tasks;

-- 2. milestones 权限策略（与 weekly_reports 一致）
--    所有人可读，admin/member 可写，仅 admin 可删
CREATE POLICY "milestones_select" ON milestones
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "milestones_insert" ON milestones
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')
  ));

CREATE POLICY "milestones_update" ON milestones
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')
  ));

CREATE POLICY "milestones_delete" ON milestones
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- 3. project_tasks 权限策略
CREATE POLICY "project_tasks_select" ON project_tasks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "project_tasks_insert" ON project_tasks
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')
  ));

CREATE POLICY "project_tasks_update" ON project_tasks
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')
  ));

CREATE POLICY "project_tasks_delete" ON project_tasks
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- 4. 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
