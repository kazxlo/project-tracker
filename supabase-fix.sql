-- ============================================================
-- 一次性修复脚本：触发器自动创建 profile + 刷新 schema 缓存
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================================

-- 1. 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. 创建触发器函数：新用户注册时自动创建 profile，首用户为 admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '用户'),
    CASE WHEN (SELECT COUNT(*) FROM public.profiles) = 0 THEN 'admin' ELSE 'member' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 绑定触发器到 auth.users 表
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. 确保 profiles 表有 role 列和默认值
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 5. 刷新 PostgREST schema 缓存（让 REST API 认识 role 列）
NOTIFY pgrst, 'reload schema';
