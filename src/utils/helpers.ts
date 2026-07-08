/**
 * 全局公共工具函数 — 日期/颜色/项目过滤/周报聚合等
 */
import type { Project, WeeklyReport, Milestone, ProjectTask } from '../types';

/** 生成唯一 ID（优先 crypto.randomUUID，回退 Date.now+随机） */
export function genId(prefix = ''): string {
  const core = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix + core;
}

/** 今日日期字符串 YYYY-MM-DD（本地时区，避免 UTC 偏差） */
export function getTodayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期格式化为 YYYY.MM.DD */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 日期格式化为中文 YYYY年MM月DD日 */
export function formatDateChinese(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

/** 日期格式化为短格式 M/D */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** hex 颜色转 {r,g,b} */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
}

/** 获取本周一 ~ 周五的日期 {start, end} (YYYY-MM-DD) */
export function getWeekRange(): { start: string; end: string } {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { start: fmt(monday), end: fmt(friday) };
}

/** 项目颜色调色板 */
export const COLOR_PALETTE = [
  '#5B9EF5', '#4ADE80', '#FB923C', '#A78BFA',
  '#2DD4BF', '#FBBF24', '#F472B6', '#60A5FA',
];

/** 风险等级颜色映射 {bg, color} */
export const RISK_LEVEL_COLORS: Record<string, { bg: string; color: string }> = {
  '高': { bg: '#FCEBEB', color: '#A32D2D' },
  '中': { bg: '#FAEEDA', color: '#854F0B' },
  '低': { bg: '#EAF3DE', color: '#2d8a4e' },
};

/** 风险等级排序权重（高<中<低） */
export const RISK_LEVEL_ORDER: Record<string, number> = { '高': 0, '中': 1, '低': 2 };

/**
 * 按 viewerIds 过滤可见项目。
 * - admin 可见全部
 * - 其他用户：项目 viewerIds 为空/undefined = 所有人可见；否则仅当包含该用户 id 时可见
 */
export function filterVisibleProjects(
  projects: Project[],
  userId: string,
  role: string
): Project[] {
  if (role === 'admin') return projects;
  return projects.filter(p => !p.viewerIds || p.viewerIds.length === 0 || p.viewerIds.includes(userId));
}

/** 取一组周报中最新的一期（按 weekStart DESC），无则 null */
export function getLatestReport(reports: WeeklyReport[]): WeeklyReport | null {
  if (reports.length === 0) return null;
  return reports.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
}

/**
 * 单条里程碑进度：
 * - 有关联任务 → 关联任务 progress 的算术平均（最客观）
 * - 无关联任务 → 按 status 兜底映射（待开始0 / 进行中50 / 已完成100 / 已逾期100）
 */
export function calcMilestoneProgress(m: Milestone, tasks: ProjectTask[]): number {
  const linked = tasks.filter(t => t.milestoneId === m.id);
  if (linked.length > 0) {
    const avg = linked.reduce((s, t) => s + (t.progress || 0), 0) / linked.length;
    return Math.round(avg);
  }
  switch (m.status) {
    case '已完成':
    case '已逾期':
      return 100;
    case '进行中':
      return 50;
    default:
      return 0; // 待开始
  }
}

/**
 * 取某项目的「有效里程碑集合」：仅返回该项目自身的里程碑（方案A：不再沿 parentId 向上继承祖先项目的里程碑）。
 * 子项目只看自身规划，父规划不再向下继承到子项目。
 * 任务通过 milestoneId 关联、不卡 projectId，因此进入集合的里程碑其下任务自动生效。
 */
export function getEffectiveMilestones(
  projectId: string,
  _allProjects: Project[],
  allMilestones: Milestone[]
): Milestone[] {
  // 方案A：仅取自身里程碑，不再向上累计祖先里程碑
  return allMilestones.filter(m => m.projectId === projectId);
}

/**
 * 单个项目（父或子）的里程碑整体进度：
 * 取「有效里程碑集合」（仅自身）所有里程碑进度的平均；若集合为空，返回 null（无法推导）
 */
export function calcProjectMilestoneProgress(
  projectId: string,
  allProjects: Project[],
  milestones: Milestone[],
  tasks: ProjectTask[]
): number | null {
  const ms = getEffectiveMilestones(projectId, allProjects, milestones);
  if (ms.length === 0) return null;
  const avg = ms.reduce((s, m) => s + calcMilestoneProgress(m, tasks), 0) / ms.length;
  return Math.round(avg);
}

/**
 * 单个项目的统一进度入口（里程碑优先）：
 * 1. 该项目有关联里程碑 → 直接取里程碑推导进度（由关联任务 progress 平均）
 * 2. 否则退化为：自身最新周报 progress || project.progress || 0
 */
export function calcProjectProgress(
  project: Project,
  allReports: WeeklyReport[],
  allProjects: Project[],
  milestones: Milestone[],
  tasks: ProjectTask[]
): number {
  const ms = calcProjectMilestoneProgress(project.id, allProjects, milestones, tasks);
  if (ms !== null) return ms;
  const reps = allReports.filter(r => r.projectId === project.id);
  const latest = getLatestReport(reps);
  return latest?.progress || project.progress || 0;
}

/**
 * 计算父项目综合进度：
 * - 有子项目时：仅聚合各子项目进度（里程碑优先，仅各自自身规划）取简单算术平均，不含自身
 * - 无子项目时：取自身统一进度（里程碑优先）
 * 注意：milestones / tasks 需为全量数据（含子项目），progress 计算才能正确纳入各项目自身里程碑
 */
export function calcOverallProgress(
  project: Project,
  allReports: WeeklyReport[],
  childProjects: Project[],
  allProjects: Project[],
  milestones: Milestone[],
  tasks: ProjectTask[]
): number {
  if (childProjects.length > 0) {
    const values: number[] = [];
    childProjects.forEach(c => {
      const progress = calcProjectProgress(c, allReports, allProjects, milestones, tasks);
      values.push(progress);
    });
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }
  return calcProjectProgress(project, allReports, allProjects, milestones, tasks);
}

/**
 * 根据关联任务的完成情况自动推导里程碑状态。
 * - 无关联任务 → 返回原始状态（向后兼容）
 * - 全部完成且无逾期 → '已完成'
 * - 全部完成但有逾期 → '已逾期'
 * - 有进行中/有风险 → '进行中'
 * - 全部待开始 → '待开始'
 */
export function deriveMilestoneStatus(
  milestone: Milestone,
  tasks: ProjectTask[],
  today?: string
): Milestone['status'] {
  const linked = tasks.filter(t => t.milestoneId === milestone.id);
  if (linked.length === 0) return milestone.status;

  const t = today || getTodayStr();
  const allDone = linked.every(tk => tk.status === '已完成');
  // 与里程碑自身 targetDate 比较，而非今天：任务 deadline 超出里程碑目标日期才算逾期
  const milestoneDeadline = milestone.targetDate || t;
  const anyOverdue = linked.some(tk => {
    if (tk.status !== '已完成' || !tk.deadline) return false;
    return tk.deadline > milestoneDeadline;
  });

  if (allDone && !anyOverdue) return '已完成';
  if (allDone && anyOverdue) return '已逾期';
  // 里程碑目标日期已过但任务未全部完成 → 已逾期
  if (milestone.targetDate && milestone.targetDate < t && !allDone) return '已逾期';
  if (linked.some(tk => tk.status === '进行中' || tk.status === '有风险')) return '进行中';
  return '待开始';
}
