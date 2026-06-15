-- ============================================
-- 公共只读账号 & RLS 策略更新
-- 请在 Supabase SQL Editor 中粘贴并执行
--
-- ⚠️ 安全提醒：此文件包含明文密码，请勿提交到公开仓库。
--    生产环境建议通过 Supabase Dashboard → Authentication → Users → Add User 手动创建，
--    或使用环境变量/密钥管理服务注入密码。
-- ============================================

-- 1. 更新 RLS 策略：禁止 public 角色写入/修改/删除

-- weekly_reports: public 角色不可写入和修改
DROP POLICY IF EXISTS "reports_insert" ON weekly_reports;
CREATE POLICY "reports_insert" ON weekly_reports FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')));

DROP POLICY IF EXISTS "reports_update" ON weekly_reports;
CREATE POLICY "reports_update" ON weekly_reports FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'member')));

-- profiles: public 角色不可修改
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin')));

-- 2. 创建公共只读用户（通过 Supabase Auth 函数）
-- 注意：如果 supabase_admin.create_user 不可用，请通过 Supabase Dashboard → Authentication → Users → Add User 手动创建：
--   邮箱: public@123.com
--   密码: public
--   确认邮箱: 勾选 "Auto Confirm User"
--   然后执行下面的步骤 3 设置角色

DO $$
DECLARE
  v_uid uuid;
  v_old_uid uuid;
BEGIN
  -- 0. 清理旧邮箱的 public 用户（如果之前创建过 public@project-tracker.internal）
  SELECT id INTO v_old_uid FROM auth.users WHERE email = 'public@project-tracker.internal' LIMIT 1;
  IF v_old_uid IS NOT NULL THEN
    DELETE FROM profiles WHERE id = v_old_uid;
    DELETE FROM auth.identities WHERE user_id = v_old_uid;
    DELETE FROM auth.users WHERE id = v_old_uid;
    RAISE NOTICE '已删除旧 public 用户 (public@project-tracker.internal), ID: %', v_old_uid;
  END IF;

  -- 检查新邮箱用户是否已存在
  SELECT id INTO v_uid FROM auth.users WHERE email = 'public@123.com' LIMIT 1;
  
  IF v_uid IS NULL THEN
    -- 创建 auth 用户
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'public@123.com',
      crypt('public', gen_salt('bf')),
      now(),
      '{"display_name":"公共访问"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ) RETURNING id INTO v_uid;
  ELSE
    -- 用户已存在，确保密码为 public
    UPDATE auth.users
    SET encrypted_password = crypt('public', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = '{"display_name":"公共访问"}'::jsonb,
        updated_at = now()
    WHERE id = v_uid;
  END IF;
  
  -- 3. 在 profiles 表中设置 public 角色
  INSERT INTO profiles (id, display_name, role, created_at)
  VALUES (v_uid, '公共访问', 'public', now())
  ON CONFLICT (id) DO UPDATE SET role = 'public', display_name = '公共访问';
  
  RAISE NOTICE '公共用户已创建/更新，ID: %', v_uid;
END $$;
