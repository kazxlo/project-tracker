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
 * 计算父项目综合进度：
 * - 有子项目时：仅聚合各子项目进度取简单算术平均，不含自身
 * - 无子项目时：取自身最新周报进度
 * 每个子项目的进度优先级：latest周报.progress || Project.progress || 0
 */
export function calcOverallProgress(
  selfReports: WeeklyReport[],
  childReportsList: WeeklyReport[][],
  childProjects: Project[] = []
): number {
  // 有子项目：仅聚合子项目，不含自身
  if (childReportsList.length > 0) {
    const values: number[] = [];
    childReportsList.forEach((reps, i) => {
      const latest = getLatestReport(reps);
      const childProject = childProjects[i];
      const progress = latest?.progress || childProject?.progress || 0;
      if (progress > 0) values.push(progress);
    });
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  }
  // 无子项目：取自身最新周报进度
  const selfLatest = getLatestReport(selfReports);
  return selfLatest?.progress || 0;
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
