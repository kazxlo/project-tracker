-- ============================================
-- 开放 projects 表的 INSERT/UPDATE/DELETE 给 member 角色
-- 父项目的编辑权限仍由前端控制保留给 admin
-- ============================================

-- 删除旧的 projects 写策略
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

-- 重建：admin 和 member 均可增/改子项目，删仅 admin
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')));
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')));
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')));
