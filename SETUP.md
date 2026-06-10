# 项目跟踪管理系统 — Supabase 部署指南

本指南覆盖从零到上线的全过程，按顺序操作即可让 4-6 人通过互联网访问。

---

## 一、环境准备

确认项目依赖已安装：

```bash
npm install
```

---

## 二、创建 Supabase 项目

1. 打开 [supabase.com](https://supabase.com)
2. 点击 **Start your project** → 用 **GitHub** 或 **邮箱** 登录/注册
3. 点击 **New project**，填写：

| 字段 | 值 | 说明 |
|------|-----|------|
| Organization | 创建或选择一个 | 个人用默认即可 |
| Name | `project-tracker` | 项目名称 |
| Database Password | 设置并**记住** | 后续建表需要 |
| Region | **Northeast Asia (Tokyo)** | 国内访问最快 |

4. 点击 **Create project**，等待 1-2 分钟初始化

---

## 三、创建数据库表

1. 左侧菜单 → **SQL Editor**
2. 点击 **New query**
3. 粘贴以下 SQL 并点击 **Run**：

```sql
-- ============================================
-- 用户扩展信息表
-- ============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 项目表
-- ============================================
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '正常推进',
  color TEXT NOT NULL DEFAULT '#378ADD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 周报表
-- ============================================
CREATE TABLE weekly_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  week_label TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  goals TEXT DEFAULT '',
  highlights TEXT DEFAULT '',
  progress INT DEFAULT 0,
  completed_items JSONB DEFAULT '[]',
  planned_items JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS 行级安全策略（允许已认证用户读写所有数据）
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

-- profiles: 用户只能插入自己的资料
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- projects: 已认证用户可读写所有项目
CREATE POLICY "projects_select" ON projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated USING (true);

-- weekly_reports: 已认证用户可读写所有周报
CREATE POLICY "reports_select" ON weekly_reports
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert" ON weekly_reports
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reports_update" ON weekly_reports
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "reports_delete" ON weekly_reports
  FOR DELETE TO authenticated USING (true);
```

4. 看到 **"Success. No rows returned"** 即表示建表成功

---

## 四、获取 Supabase API 密钥

1. 左侧菜单 → **Project Settings** → **API**
2. 复制以下两个值：

| 字段 | 变量名 | 说明 |
|------|--------|------|
| **Project URL** | `VITE_SUPABASE_URL` | 形如 `https://xxxxxxxxxxxx.supabase.co` |
| **anon public** | `VITE_SUPABASE_ANON_KEY` | 以 `eyJhbGciOi...` 开头 |

---

## 五、配置前端连接

在项目根目录创建 `.env` 文件（复制 `.env.example` 并填入真实值）：

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ `.env` 已在 `.gitignore` 中，不会被提交到 Git。不要手动 git add 它。

---

## 六、本地测试

```bash
npm run dev
```

打开 `http://localhost:5173`，你应该看到：
- 登录页（邮箱 + 密码）
- 第一个用户需要点击「没有账号？点此注册」
- 注册后即可使用系统，其他 3-5 人也各用自己的邮箱注册

---

## 七、部署上线（EdgeOne Pages 推荐）

### 方式 A：EdgeOne Pages（国内访问快，推荐）

1. 在 IDE 顶部点击 **Integration** → **EdgeOne Pages**
2. 按提示授权登录
3. 项目根目录已有构建配置，一键部署
4. 在 EdgeOne Pages 控制台 → 环境变量，添加：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### 方式 B：Vercel（国际通用）

```bash
npm run build              # 构建产物 → dist/
npx vercel --prod          # 按提示部署
```

部署后在 Vercel Dashboard → Settings → Environment Variables 添加：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 方式 C：Cloudflare Pages

1. 上传 `dist/` 目录到 Cloudflare Pages
2. 环境变量同上

---

## 八、邀请用户

1. 部署后你会得到一个公网 URL，如 `https://project-tracker.xxx.app`
2. 将 URL 发给团队成员
3. 每人首次访问时用自己的邮箱注册账号
4. 所有人在 Supabase 共享同一份数据

---

## 九、Supabase Auth 设置（可选）

如果需要关闭邮箱确认（注册后无需查收邮件即可登录）：

1. Supabase 控制台 → **Authentication** → **Providers**
2. **Email** 部分 → 关闭 **Confirm email**（开发阶段建议关闭）
3. 点击 **Save**

---

## 十、日常开发流程

```bash
# 开发
git checkout feature/add-supabase   # 当前分支
npm run dev                          # 本地开发连 Supabase

# 提交
git add .
git commit -m "feat: xxx"

# 部署
npm run build                        # 构建
# → 上传 dist/ 到托管平台

# 合并到主分支
git checkout main
git merge feature/add-supabase
```

---

## 常见问题

### Q: 本地 dev 能正常跑，部署后白屏？
检查托管平台的环境变量是否配置了 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### Q: Supabase 免费够用吗？
免费层包含：500MB 数据库、5GB 带宽、50,000 月活用户。4-6 人团队完全够用。

### Q: 数据安全吗？
Supabase 使用 PostgreSQL，数据加密存储，RLS 策略保证只有登录用户才能读写。

### Q: 如果有人离职了怎么处理？
在 Supabase → Authentication → Users 中删除该用户即可。

---

## 关键文件速查

| 文件 | 作用 |
|------|------|
| `src/api/supabase.ts` | Supabase 客户端初始化 |
| `src/api/db.ts` | 数据 CRUD（项目/周报） |
| `src/hooks/useAuth.tsx` | 认证 Context（登录/注册/登出） |
| `src/pages/Login.tsx` | 登录注册页面 |
| `.env` | Supabase URL + Key（不提交） |
| `.env.example` | 环境变量模板 |
