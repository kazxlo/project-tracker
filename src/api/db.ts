import { supabase } from './supabase';
import type { Project, WeeklyReport, ReportItem, Risk } from '../types';

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
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapProject);
}

export async function getProject(id: string): Promise<Project | undefined> {
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
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  // 先删周报再删项目（外键级联删除）
  await supabase.from('weekly_reports').delete().eq('project_id', id);
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ==================== 周报 CRUD ====================

export async function getReports(projectId: string): Promise<WeeklyReport[]> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('week_start', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReport);
}

export async function getReport(id: string): Promise<WeeklyReport | undefined> {
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
}

export async function getLatestReport(projectId: string): Promise<WeeklyReport | undefined> {
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
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('weekly_reports').delete().eq('id', id);
  if (error) throw error;
}

export async function getAllReports(): Promise<WeeklyReport[]> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .order('week_start', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapReport);
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

// ==================== 数据导出（保留兼容旧功能） ====================

/** 导出项目数据为 JSON */
export async function exportAllData(): Promise<string> {
  const [projects, reports] = await Promise.all([getProjects(), getAllReports()]);
  return JSON.stringify({ projects, reports }, null, 2);
}

/** 从 JSON 导入数据（会覆盖当前数据） */
export async function importAllData(jsonStr: string): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { success: false, message: '数据格式无效：缺少 projects 字段' };
    }
    if (!Array.isArray(parsed.reports)) {
      return { success: false, message: '数据格式无效：缺少 reports 字段' };
    }
    // 先清空再导入
    const { error: delError } = await supabase.from('weekly_reports').delete().neq('id', '__skip__');
    if (delError) throw delError;
    const { error: delProjError } = await supabase.from('projects').delete().neq('id', '__skip__');
    if (delProjError) throw delProjError;

    for (const p of parsed.projects) {
      await saveProject(p);
    }
    for (const r of parsed.reports) {
      await saveReport(r);
    }
    return { success: true, message: `导入成功：${parsed.projects.length} 个项目，${parsed.reports.length} 份周报` };
  } catch {
    return { success: false, message: '无法解析 JSON 数据，请确认文件格式正确' };
  }
}
