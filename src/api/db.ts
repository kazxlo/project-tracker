import { supabase } from './supabase';
import type { Project, WeeklyReport, ReportItem, Risk, Milestone, ProjectTask } from '../types';

// ==================== 读取缓存 ====================
// 作用：同一会话内切换页面时复用已拉取的数据，避免每次导航都重新请求 Supabase。
// 机制：内存缓存 + 并发去重（同一 key 的在途请求合并）+ 写操作后整体失效。
const CACHE_TTL = 300_000; // 5 分钟
const _readCache = new Map<string, { time?: number; value?: unknown; inflight?: Promise<unknown> }>();
let _cacheGen = 0; // 缓存代次：写操作使其递增，用于丢弃"写操作之前发出的在途读取"的结果

function cachedRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = _readCache.get(key);
  if (hit) {
    if (hit.inflight) return hit.inflight as Promise<T>;
    if (hit.time !== undefined && Date.now() - hit.time < CACHE_TTL) return Promise.resolve(hit.value as T);
  }
  const gen = _cacheGen;
  const inflight = loader()
    .then(value => {
      // 期间若发生写操作（代次变化），不回填缓存，避免缓存旧数据
      if (gen === _cacheGen) _readCache.set(key, { time: Date.now(), value });
      return value;
    })
    .catch(err => {
      if (gen === _cacheGen) _readCache.delete(key);
      throw err;
    });
  _readCache.set(key, { inflight });
  return inflight;
}

/** 清空读取缓存（任何写操作后调用，确保后续读取为最新数据） */
export function invalidateReadCache(): void {
  _cacheGen++;
  _readCache.clear();
}

// ==================== 字段映射 ====================
// 数据库 snake_case ↔ 前端 camelCase

function mapProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    startDate: row.start_date,
    deadline: row.deadline || undefined,
    deadlineExtensions: row.deadline_extensions ?? 0,
    lastDeadline: row.last_deadline || undefined,
    status: row.status,
    color: row.color,
    viewerIds: row.viewer_ids || undefined,
    parentId: row.parent_id || undefined,
    description: row.description || undefined,
    serviceStart: row.service_start || undefined,
    serviceEnd: row.service_end || undefined,
    detailedItems: row.detailed_items || undefined,
    progress: row.progress ?? undefined,
  };
}

function mapReport(row: any): WeeklyReport {
  return {
    id: row.id,
    projectId: row.project_id,
    weekLabel: row.week_label,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    goals: row.goals || '',
    highlights: row.highlights || '',
    progress: row.progress ?? 0,
    completedItems: (row.completed_items || []) as ReportItem[],
    plannedItems: (row.planned_items || []) as ReportItem[],
    risks: (row.risks || []) as Risk[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== 项目 CRUD ====================

export async function getProjects(): Promise<Project[]> {
  return cachedRead('projects', async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProject);
  });
}

export async function getProject(id: string): Promise<Project | undefined> {
  return cachedRead(`project:${id}`, async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return undefined; // 未找到
      throw error;
    }
    return mapProject(data);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const { error } = await supabase.from('projects').upsert({
    id: project.id,
    name: project.name,
    owner: project.owner,
    start_date: project.startDate,
    deadline: project.deadline || null,
    deadline_extensions: project.deadlineExtensions ?? 0,
    last_deadline: project.lastDeadline || null,
    status: project.status,
    color: project.color,
    viewer_ids: (project.viewerIds && project.viewerIds.length > 0) ? project.viewerIds : null,
    parent_id: project.parentId || null,
    description: project.description || null,
    service_start: project.serviceStart || null,
    service_end: project.serviceEnd || null,
    detailed_items: project.detailedItems || null,
    progress: project.progress ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  invalidateReadCache();
}

export async function deleteProject(id: string): Promise<void> {
  // 级联删除关联数据（外键已有 ON DELETE CASCADE，但显式删除更安全）
  await supabase.from('project_tasks').delete().eq('project_id', id);
  await supabase.from('milestones').delete().eq('project_id', id);
  await supabase.from('weekly_reports').delete().eq('project_id', id);
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
  invalidateReadCache();
}

// ==================== 周报 CRUD ====================

export async function getReports(projectId: string): Promise<WeeklyReport[]> {
  return cachedRead(`reports:${projectId}`, async () => {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('week_start', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapReport);
  });
}

export async function getReport(id: string): Promise<WeeklyReport | undefined> {
  return cachedRead(`report:${id}`, async () => {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw error;
    }
    return mapReport(data);
  });
}

export async function getLatestReport(projectId: string): Promise<WeeklyReport | undefined> {
  return cachedRead(`latestReport:${projectId}`, async () => {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('week_start', { ascending: false })
      .limit(1)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return undefined;
      throw error;
    }
    return mapReport(data);
  });
}

export async function saveReport(report: WeeklyReport): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('weekly_reports').upsert({
    id: report.id,
    project_id: report.projectId,
    week_label: report.weekLabel,
    week_start: report.weekStart,
    week_end: report.weekEnd,
    goals: report.goals,
    highlights: report.highlights,
    progress: report.progress,
    completed_items: report.completedItems,
    planned_items: report.plannedItems,
    risks: report.risks,
    created_at: report.createdAt || now,
    updated_at: now,
  });
  if (error) throw error;
  invalidateReadCache();
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('weekly_reports').delete().eq('id', id);
  if (error) throw error;
  invalidateReadCache();
}

/**
 * 更新风险状态：更新该项目下所有包含该风险描述的周报中对应风险的状态。
 * 之所以更新全部而非仅最新一期：累计风险统计跨所有周报去重 status!==已解决，
 * 若只改最新一期，历史周报中同描述风险仍计为活跃，导致"标记已解决后风险数不降"。
 * 仅 admin/member 可调用（调用方需自行校验权限）
 */
export async function updateRiskStatus(
  projectId: string,
  riskDescription: string,
  newStatus: Risk['status']
): Promise<void> {
  invalidateReadCache(); // 更新前清空缓存，确保基于最新周报计算
  const reports = await getReports(projectId); // 已按 week_start DESC 排序
  const key = riskDescription.trim();
  let updated = false;
  for (const report of reports) {
    let changed = false;
    const newRisks = report.risks.map(r => {
      if (r.description.trim() === key) {
        changed = true;
        updated = true;
        const next = { ...r, status: newStatus };
        if (newStatus === '已解决') next.resolvedAt = new Date().toISOString();
        return next;
      }
      return r;
    });
    if (changed) {
      await saveReport({ ...report, risks: newRisks });
    }
  }
  // updated 仅用于语义标注，未命中也不报错
  void updated;
}

export async function getAllReports(): Promise<WeeklyReport[]> {
  return cachedRead('allReports', async () => {
    const { data, error } = await supabase
      .from('weekly_reports')
      .select('*')
      .order('week_start', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapReport);
  });
}

// ==================== 工具函数（不涉及数据库） ====================

/**
 * 根据周一日期自动生成周次标签，例如 weekStart="2026-06-08" → "第24周"
 */
export function generateWeekLabel(weekStart: string): string {
  if (!weekStart) return '';
  const d = new Date(weekStart + 'T00:00:00');
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const daysSinceJan1 = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.floor((daysSinceJan1 + jan1.getDay()) / 7) + 1;
  return `第${weekNum}周`;
}

// ==================== 里程碑 CRUD ====================

function mapMilestone(row: any): Milestone {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    targetDate: row.target_date || undefined,
    status: row.status,
    description: row.description || undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

export async function getMilestones(projectId: string): Promise<Milestone[]> {
  return cachedRead(`milestones:${projectId}`, async () => {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapMilestone);
  });
}

export async function saveMilestone(m: Milestone): Promise<void> {
  const { error } = await supabase.from('milestones').upsert({
    id: m.id,
    project_id: m.projectId,
    name: m.name,
    target_date: m.targetDate || null,
    status: m.status,
    description: m.description || null,
    sort_order: m.sortOrder,
  });
  if (error) throw error;
  invalidateReadCache();
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await supabase.from('milestones').delete().eq('id', id);
  if (error) throw error;
  invalidateReadCache();
}

// ==================== 项目任务 CRUD ====================

function mapProjectTask(row: any): ProjectTask {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    startDate: row.start_date || undefined,
    deadline: row.deadline || undefined,
    progress: row.progress ?? 0,
    description: row.description || undefined,
    milestoneId: row.milestone_id || undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

export async function getProjectTasks(projectId: string): Promise<ProjectTask[]> {
  return cachedRead(`tasks:${projectId}`, async () => {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProjectTask);
  });
}

export async function saveProjectTask(t: ProjectTask): Promise<void> {
  const { error } = await supabase.from('project_tasks').upsert({
    id: t.id,
    project_id: t.projectId,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    start_date: t.startDate || null,
    deadline: t.deadline || null,
    progress: t.progress,
    description: t.description || null,
    milestone_id: t.milestoneId || null,
    sort_order: t.sortOrder,
  });
  if (error) throw error;
  invalidateReadCache();
}

export async function deleteProjectTask(id: string): Promise<void> {
  const { error } = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) throw error;
  invalidateReadCache();
}

// ==================== 全局查询（驾驶舱用） ====================

export async function getAllMilestones(): Promise<Milestone[]> {
  return cachedRead('allMilestones', async () => {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapMilestone);
  });
}

export async function getAllProjectTasks(): Promise<ProjectTask[]> {
  return cachedRead('allTasks', async () => {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProjectTask);
  });
}

// ==================== 数据导出（保留兼容旧功能） ====================

/** 导出项目数据为 JSON（按项目嵌套周报、里程碑、任务） */
export async function exportAllData(): Promise<string> {
  invalidateReadCache(); // 导出前清空缓存，确保导出为最新数据
  const [projects, reports, milestones, tasks] = await Promise.all([
    getProjects(), getAllReports(), getAllMilestones(), getAllProjectTasks(),
  ]);
  const reportMap = new Map<string, WeeklyReport[]>();
  const milestoneMap = new Map<string, Milestone[]>();
  const taskMap = new Map<string, ProjectTask[]>();
  reports.forEach(r => {
    const list = reportMap.get(r.projectId) || [];
    list.push(r);
    reportMap.set(r.projectId, list);
  });
  milestones.forEach(m => {
    const list = milestoneMap.get(m.projectId) || [];
    list.push(m);
    milestoneMap.set(m.projectId, list);
  });
  tasks.forEach(t => {
    const list = taskMap.get(t.projectId) || [];
    list.push(t);
    taskMap.set(t.projectId, list);
  });
  const projectsWithData = projects.map(p => ({
    ...p,
    reports: reportMap.get(p.id) || [],
    milestones: milestoneMap.get(p.id) || [],
    tasks: taskMap.get(p.id) || [],
  }));
  return JSON.stringify({ projects: projectsWithData }, null, 2);
}

/** 从 JSON 导入数据（先写入新数据，再删除不在新数据中的旧记录，避免中途失败丢数据） */
export async function importAllData(jsonStr: string): Promise<{ success: boolean; message: string }> {
  try {
    invalidateReadCache(); // 导入前清空缓存，避免读到旧数据
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { success: false, message: '数据格式无效：缺少 projects 字段' };
    }
    // 兼容新旧格式：新格式每个project内含reports数组，旧格式顶层有reports数组
    let allProjects: Project[];
    let allReports: WeeklyReport[];
    let allMilestones: Milestone[] = [];
    let allTasks: ProjectTask[] = [];
    if (parsed.projects.length > 0 && Array.isArray(parsed.projects[0].reports)) {
      // 新格式：projects 内含 reports / milestones / tasks
      const nested = parsed.projects as (Project & {
        reports: WeeklyReport[];
        milestones?: Milestone[];
        tasks?: ProjectTask[];
      })[];
      allProjects = nested.map(({ reports: _r, milestones: _m, tasks: _t, ...p }) => p as Project);
      allReports = nested.flatMap(p => (p.reports || []) as WeeklyReport[]);
      allMilestones = nested.flatMap(p => (p.milestones || []) as Milestone[]);
      allTasks = nested.flatMap(p => (p.tasks || []) as ProjectTask[]);
    } else {
      // 旧格式：顶层 projects + reports 分开
      if (!Array.isArray(parsed.reports)) {
        return { success: false, message: '数据格式无效：缺少 reports 字段' };
      }
      allProjects = parsed.projects;
      allReports = parsed.reports;
    }

    // 收集新数据中存在的所有 id
    const newProjectIds = new Set(allProjects.map(p => p.id));
    const newReportIds = new Set(allReports.map(r => r.id));
    const newMilestoneIds = new Set(allMilestones.map(m => m.id));
    const newTaskIds = new Set(allTasks.map(t => t.id));

    // 1. 先 upsert 新数据（覆盖同名 id）
    for (const p of allProjects) await saveProject(p);
    for (const r of allReports) await saveReport(r);
    for (const m of allMilestones) await saveMilestone(m);
    for (const t of allTasks) await saveProjectTask(t);

    // 2. 删除不在新数据中的旧记录（按 id 精确删除，避免 .neq('__skip__') 的 hack）
    const [oldReports, oldMilestones, oldTasks, oldProjects] = await Promise.all([
      getAllReports(), getAllMilestones(), getAllProjectTasks(), getProjects(),
    ]);
    await Promise.all(oldReports.filter(r => !newReportIds.has(r.id)).map(r => deleteReport(r.id)));
    await Promise.all(oldMilestones.filter(m => !newMilestoneIds.has(m.id)).map(m => deleteMilestone(m.id)));
    await Promise.all(oldTasks.filter(t => !newTaskIds.has(t.id)).map(t => deleteProjectTask(t.id)));
    await Promise.all(oldProjects.filter(p => !newProjectIds.has(p.id)).map(p => deleteProject(p.id)));

    const extra = allMilestones.length > 0 || allTasks.length > 0
      ? `，${allMilestones.length} 个里程碑，${allTasks.length} 个任务`
      : '';
    return { success: true, message: `导入成功：${allProjects.length} 个项目，${allReports.length} 份周报${extra}` };
  } catch {
    return { success: false, message: '无法解析 JSON 数据，请确认文件格式正确' };
  }
}

// ==================== 悬停预取（命中缓存后点开即秒开） ====================

/** 预取项目详情所需数据（项目 / 周报列表 / 里程碑 / 任务），用于列表项悬停时提前加载 */
export function prefetchProjectDetail(projectId: string): void {
  Promise.all([
    getProject(projectId),
    getReports(projectId),
    getMilestones(projectId),
    getProjectTasks(projectId),
  ]).catch(() => { /* 预取失败静默忽略，点击时会正常再请求 */ });
}

/** 预取单期周报详情，用于周报列表项悬停时提前加载 */
export function prefetchReport(reportId: string): void {
  getReport(reportId).catch(() => { /* 预取失败静默忽略，点击时会正常再请求 */ });
}

/** 启动预热：登录态确认后提前拉取共享数据，缩短首个页面的等待 */
export function warmupCache(): void {
  Promise.all([
    getProjects(),
    getAllReports(),
    getAllMilestones(),
    getAllProjectTasks(),
  ]).catch(() => { /* 预热失败静默忽略，进入页面时会正常再请求 */ });
}
