-- 里程碑表（挂 Project 下）
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_date TEXT,
  status TEXT DEFAULT '待开始',
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
