-- 里程碑 ↔ 任务关联迁移
-- 给 project_tasks 添加 milestone_id 外键列

ALTER TABLE project_tasks 
  ADD COLUMN IF NOT EXISTS milestone_id TEXT 
  REFERENCES milestones(id) ON DELETE SET NULL;

-- 索引：加速"查某里程碑下所有任务"的查询
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone_id 
  ON project_tasks(milestone_id);

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
