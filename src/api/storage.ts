import { Project, WeeklyReport, AppData } from '../types';

const STORAGE_KEY = 'projectM_data';
const DEFAULT_PASSWORD = 'project2024';

function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  const empty: AppData = { projects: [], reports: [] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  return empty;
}

function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getProjects(): Project[] {
  return loadData().projects;
}

export function getProject(id: string): Project | undefined {
  return loadData().projects.find(p => p.id === id);
}

export function saveProject(project: Project): void {
  const data = loadData();
  const idx = data.projects.findIndex(p => p.id === project.id);
  if (idx >= 0) data.projects[idx] = project;
  else data.projects.push(project);
  saveData(data);
}

export function deleteProject(id: string): void {
  const data = loadData();
  data.projects = data.projects.filter(p => p.id !== id);
  data.reports = data.reports.filter(r => r.projectId !== id);
  saveData(data);
}

export function getReports(projectId: string): WeeklyReport[] {
  return loadData().reports
    .filter(r => r.projectId === projectId)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function getReport(id: string): WeeklyReport | undefined {
  return loadData().reports.find(r => r.id === id);
}

/** 获取项目的最新一期周报（按 weekStart 降序取第一条） */
export function getLatestReport(projectId: string): WeeklyReport | undefined {
  return getReports(projectId)[0];
}

export function saveReport(report: WeeklyReport): void {
  const data = loadData();
  const idx = data.reports.findIndex(r => r.id === report.id);
  if (idx >= 0) data.reports[idx] = report;
  else data.reports.push(report);
  saveData(data);
}

export function deleteReport(id: string): void {
  const data = loadData();
  data.reports = data.reports.filter(r => r.id !== id);
  saveData(data);
}

export function getAllReports(): WeeklyReport[] {
  return loadData().reports
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function login(password: string): boolean {
  return password === DEFAULT_PASSWORD;
}

export function isLoggedIn(): boolean {
  return localStorage.getItem('projectM_auth') === 'true';
}

export function setLoggedIn(username: string): void {
  localStorage.setItem('projectM_auth', 'true');
  localStorage.setItem('projectM_user', username);
}

export function logout(): void {
  localStorage.removeItem('projectM_auth');
  localStorage.removeItem('projectM_user');
}

export function getCurrentUser(): string {
  return localStorage.getItem('projectM_user') || '';
}

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

/**
 * 导出全部数据为 JSON 字符串
 */
export function exportAllData(): string {
  return JSON.stringify(loadData(), null, 2);
}

/**
 * 从 JSON 字符串导入数据（会覆盖当前所有数据）
 */
export function importAllData(jsonStr: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { success: false, message: '数据格式无效：缺少 projects 字段' };
    }
    if (!Array.isArray(parsed.reports)) {
      return { success: false, message: '数据格式无效：缺少 reports 字段' };
    }
    saveData(parsed as AppData);
    return { success: true, message: `导入成功：${parsed.projects.length} 个项目，${parsed.reports.length} 份周报` };
  } catch {
    return { success: false, message: '无法解析 JSON 数据，请确认文件格式正确' };
  }
}

export function initDemoData(): void {
  const data = loadData();
  // 两者都存在 → 跳过
  if (data.projects.length > 0 && data.reports.length > 0) return;

  // 没有项目 → 创建演示项目
  if (data.projects.length === 0) {
    data.projects = [
      { id: 'p1', name: '在建项目验收管理', owner: '张三', startDate: '2026-03-17', status: '正常推进', color: '#378ADD' },
      { id: 'p2', name: 'XC项目及深化设计', owner: '李四', startDate: '2026-03-17', status: '需关注', color: '#639922' },
      { id: 'p3', name: '影像云', owner: '王五', startDate: '2026-03-17', status: '存在风险', color: '#D85A30' },
      { id: 'p4', name: '三期设计方案', owner: '赵六', startDate: '2026-03-17', status: '正常推进', color: '#7F77DD' },
    ];
  }

  // 没有周报 → 创建演示周报（不会覆盖已有周报）
  if (data.reports.length === 0) {
    const weeks = [
      { label: '第9周',  start: '2026-05-06', end: '2026-05-09' },
      { label: '第10周', start: '2026-05-12', end: '2026-05-16' },
      { label: '第11周', start: '2026-05-19', end: '2026-05-23' },
      { label: '第12周', start: '2026-05-26', end: '2026-05-30' },
      { label: '第13周', start: '2026-06-02', end: '2026-06-06' },
      { label: '第14周', start: '2026-06-09', end: '2026-06-13' },
    ];

    const projectConfigs: Record<string, { base: number; variance: number }> = {
      p1: { base: 2, variance: 3 },
      p2: { base: 1, variance: 2 },
      p3: { base: 1, variance: 2 },
      p4: { base: 3, variance: 2 },
    };

    data.reports = [];

    for (const p of data.projects) {
      const cfg = projectConfigs[p.id] || { base: 1, variance: 2 };
      let weekIdx = 0;
      for (const w of weeks) {
        // 进度从初始值递增，模拟实际推进效果
        const baseProgress = p.id === 'p4' ? 55 : p.id === 'p1' ? 40 : p.id === 'p2' ? 20 : 10;
        const progress = Math.min(100, baseProgress + weekIdx * 5);
        weekIdx++;

        // p1（在建项目验收管理）使用三项子字段结构
        const isP1 = p.id === 'p1';
        const report: WeeklyReport = {
          id: `wr_${p.id}_${w.label}`,
          projectId: p.id,
          weekLabel: w.label,
          weekStart: w.start,
          weekEnd: w.end,
          createdAt: `${w.end}T18:00:00Z`,
          updatedAt: `${w.end}T18:00:00Z`,
          goals: `持续推进${p.name}相关工作，确保各模块按计划交付。`,
          highlights: `${w.label}重点完成了需求评审、接口联调及阶段性验收材料整理工作。`,
          summary: undefined,
          progress,
          completedItems: isP1
            ? [
                { id: `c_${p.id}_${w.label}_0`, order: 1, title: '宿舍管理系统', progress: '已完成接口开发与联调测试，进入UAT阶段', acceptance: '验收测试报告已提交，待甲方签字确认' },
                { id: `c_${p.id}_${w.label}_1`, order: 2, title: '资产管理系统', progress: '前端页面开发完成80%，后端API全部就绪', acceptance: '需求规格说明书、概要设计文档已归档' },
                { id: `c_${p.id}_${w.label}_2`, order: 3, title: '合同管理系统', progress: '完成数据库设计与核心流程开发', acceptance: '数据库设计文档已完成，测试用例编写中' },
              ].slice(0, cfg.base + Math.floor(Math.random() * cfg.variance))
            : Array.from(
                { length: cfg.base + Math.floor(Math.random() * cfg.variance) },
                (_, i) => ({
                  id: `c_${p.id}_${w.label}_${i}`,
                  order: i + 1,
                  title: `完成事项${i + 1}（${w.label}）`,
                  detail: Math.random() > 0.5 ? '相关说明详情' : undefined,
                }),
              ),
          plannedItems: Array.from(
            { length: 2 + Math.floor(Math.random() * 3) },
            (_, i) => ({
              id: `p_${p.id}_${w.label}_${i}`,
              order: i + 1,
              title: `计划事项${i + 1}（${w.label}）`,
            }),
          ),
          risks: Math.random() > 0.6
            ? [{
                id: `r_${p.id}_${w.label}_0`,
                order: 1,
                description: p.id === 'p3' ? '服务器资源不足，可能影响部署进度' : '部分需求未明确，需进一步沟通',
                suggestion: p.id === 'p3' ? '建议协调IT部门提前扩容，或与甲方沟通调整部署时间窗口' : '建议尽快安排专项需求澄清会议，明确边界',
                level: p.id === 'p3' ? '高' as const : '中' as const,
                status: '待处理' as const,
              }]
            : [],
        };
        data.reports.push(report);
      }
    }
  }

  saveData(data);
}
