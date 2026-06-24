-- 项目级任务表（挂 Project 下，与周报独立）
CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT '待开始',
  priority TEXT DEFAULT 'P1',
  assignee TEXT,
  deadline TEXT,
  progress INTEGER DEFAULT 0,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
