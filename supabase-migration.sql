-- ============================================
-- 权限系统升级 SQL
-- 请在 Supabase SQL Editor 中粘贴并执行
-- ============================================

-- 1. 添加 role 字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 2. 删除旧的 RLS 策略（重新用新规则替换）
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

DROP POLICY IF EXISTS "reports_select" ON weekly_reports;
DROP POLICY IF EXISTS "reports_insert" ON weekly_reports;
DROP POLICY IF EXISTS "reports_update" ON weekly_reports;
DROP POLICY IF EXISTS "reports_delete" ON weekly_reports;

-- 3. 创建新 RLS 策略

-- profiles: 所有已认证用户可读，用户自己插入
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (true);

-- projects: 所有人可读，仅 admin 可增/改/删
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- weekly_reports: 所有人可读/写，仅 admin 可删
CREATE POLICY "reports_select" ON weekly_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert" ON weekly_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reports_update" ON weekly_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "reports_delete" ON weekly_reports FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
