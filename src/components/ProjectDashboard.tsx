import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodayStr, getLatestReport, calcOverallProgress, calcProjectProgress, deriveMilestoneStatus } from '../utils/helpers';
import type { Project, WeeklyReport, Milestone, ProjectTask } from '../types';
import shared from '../styles/shared.module.css';

interface Props {
  project: Project;
  reports: WeeklyReport[];
  childProjects: Project[];
  allReports: WeeklyReport[];
  milestones: Milestone[];
  tasks: ProjectTask[];
  allMilestones: Milestone[];
  allTasks: ProjectTask[];
  allProjects: Project[];
  onOpenPlanEditor: () => void;
  getChildStats: (childId: string) => { reportCount: number; progress: number; riskCount: number };
  isPublic?: boolean;
}

export default function ProjectDashboard({
  project, reports, childProjects, allReports, milestones, tasks, allMilestones, allTasks, allProjects, onOpenPlanEditor, getChildStats, isPublic,
}: Props) {
  const navigate = useNavigate();
  const today = getTodayStr();

  // 视图范围：自身 + 子项目（仅顶层项目纵览其子项目；方案A 子项目不再向上继承父项目规划）
  const viewScopeIds = useMemo(() => {
    const ids = new Set<string>([project.id]);
    // 仅顶层项目（无 parentId）纵览其直接子项目；子项目只看自身规划，不向上继承父规划
    if (!project.parentId) {
      childProjects.forEach(c => ids.add(c.id));
    }
    return ids;
  }, [project, childProjects]);

  // 综合进度：有子项目时仅聚合子项目（里程碑优先，仅各自自身规划），无子项目时取自身统一进度（仅自身规划）
  const overallProgress = childProjects.length > 0
    ? calcOverallProgress(project, allReports, childProjects, allProjects, allMilestones, allTasks)
    : calcProjectProgress(project, allReports, allProjects, allMilestones, allTasks);

  // ====== 层2数据：子项目颜色判断 ======
  const getProgressColor = (childProgress: number, childStart?: string, childEnd?: string) => {
    if (childProgress >= 90) return { color: '#7F77DD', label: '已完成' }; // 紫
    if (childProgress >= 60) return { color: '#378ADD', label: '正常' };   // 蓝
    // 检查是否滞后
    if (childStart && childEnd) {
      const totalDays = (new Date(childEnd + 'T00:00:00').getTime() - new Date(childStart + 'T00:00:00').getTime()) / 86400000;
      const elapsedDays = (new Date(today + 'T00:00:00').getTime() - new Date(childStart + 'T00:00:00').getTime()) / 86400000;
      if (totalDays > 0) {
        const expectedPct = Math.min(100, (elapsedDays / totalDays) * 100);
        if (childProgress < expectedPct * 0.7) return { color: '#D85A30', label: '滞后', lag: true };
      }
    }
    if (childProgress >= 30) return { color: '#639922', label: '平稳' };   // 绿
    return { color: '#D85A30', label: '滞后', lag: true };                // 橙
  };

  // 里程碑数据处理：合并「自身 + 子项目（仅顶层项目纵览子）」范围内的里程碑（不再向上继承父规划）
  const milestoneEntries = useMemo(() => {
    const nameMap = new Map(allProjects.map(p => [p.id, p.name]));
    const ms = allMilestones.filter(m => viewScopeIds.has(m.projectId));
    if (ms.length === 0) return [];
    return ms
      .slice()
      .sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''))
      .map(m => ({
        type: deriveMilestoneStatus(m, allTasks, today),
        name: m.name,
        date: m.targetDate || '',
        description: m.description || '',
        sourceName: nameMap.get(m.projectId) || '',
      }));
  }, [viewScopeIds, allMilestones, allTasks, allProjects, today]);

  // ====== 层3数据：任务列表 ======
  const [taskFilter, setTaskFilter] = useState<string>('全部');

  const displayTasks = useMemo(() => {
    // 合并视图范围内任务：自身 + 子项目（仅顶层项目纵览子；不再向上继承父规划）
    let list: ProjectTask[] = allTasks.filter(t => viewScopeIds.has(t.projectId));

    // 无任务时用子项目最新周报数据近似
    if (list.length === 0 && childProjects.length > 0) {
      list = [];
      childProjects.forEach(c => {
        const crpts = allReports.filter(r => r.projectId === c.id);
        if (crpts.length === 0) return;
        const clatest = getLatestReport(crpts);
        if (!clatest) return;

        clatest.completedItems.forEach(ci => {
          list.push({
            id: `synth_${c.id}_c_${ci.id}`,
            projectId: c.id,
            title: ci.title,
            status: '已完成' as const,
            priority: 'P1' as const,
            assignee: c.owner,
            deadline: clatest.weekEnd,
            progress: 100,
            sortOrder: 0,
          });
        });
        clatest.plannedItems.filter(pi => !pi.carriedForward).forEach(pi => {
          list.push({
            id: `synth_${c.id}_p_${pi.id}`,
            projectId: c.id,
            title: pi.title,
            status: '进行中' as const,
            priority: 'P1' as const,
            assignee: c.owner,
            deadline: clatest.weekEnd,
            progress: 0,
            sortOrder: 0,
          });
        });
      });
    }

    if (taskFilter === '全部') return list;
    if (taskFilter === '有风险') return list.filter(t => t.status === '有风险');
    return list.filter(t => t.status === taskFilter);
  }, [allTasks, viewScopeIds, childProjects, allReports, taskFilter]);

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ====== 层2: 子项目进度(左) + 里程碑(右) ====== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* 左列: 子项目进度 */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              {childProjects.length > 0 ? '子项目进度' : '项目进度'}
            </span>
            {childProjects.length > 0 && (
              <span style={{ fontSize: 11, color: '#6b7a93', cursor: 'pointer' }}>
                点击查看详情 →
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(childProjects.length > 0 ? childProjects : [project]).map(p => {
              const progressVal = childProjects.length > 0 ? getChildStats(p.id).progress : overallProgress;
              const cInfo = getProgressColor(progressVal, p.serviceStart, p.serviceEnd);
              const deadline = p.deadline || p.serviceEnd;
              return (
                <div key={p.id} onClick={() => navigate(`/project/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{
                      color: cInfo.color, fontWeight: cInfo.lag ? 500 : 400,
                    }}>
                      {progressVal}%{cInfo.lag ? ' ⚠' : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${progressVal}%`, height: '100%',
                      background: cInfo.color, borderRadius: 3, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: cInfo.lag ? '#D85A30' : '#6b7a93', marginTop: 2 }}>
                    {p.owner}{deadline ? ` · 预计${deadline}` : ''}
                    {cInfo.lag && ` · ${cInfo.label}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右列: 里程碑时间轴 */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>里程碑路线图</span>
            {!isPublic && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className={shared.btnToolbar}
                  onClick={onOpenPlanEditor}
                  style={{ fontSize: 11 }}
                >
                  {milestones.length > 0 ? '编辑' : '+ 添加'}
                </button>
              </div>
            )}
          </div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{
              position: 'absolute', left: 5, top: 6, bottom: 6,
              width: 1.5, background: '#e5e7eb',
            }} />
            {milestoneEntries.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#6b7a93', fontSize: 13 }}>
                暂无里程碑，点击右上角添加
              </div>
            )}
            {milestoneEntries.map((entry, i) => (
              <div key={`${entry.name}_${entry.date}_${i}`} style={{ marginBottom: i < milestoneEntries.length - 1 ? 14 : 0, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: -18, top: 2, width: 10, height: 10, borderRadius: '50%',
                  background:
                    entry.type === '已完成' ? '#7F77DD' :
                    entry.type === '已逾期' ? '#D85A30' :
                    entry.type === '进行中' ? '#378ADD' : '#e5e7eb',
                  border: entry.type === '待开始' ? '1.5px solid #bfc8d6' : 'none',
                }} />
                <span style={{
                  fontSize: 11, padding: '1px 6px', borderRadius: 8, fontWeight: 500,
                  background:
                    entry.type === '已完成' ? '#EEEDFE' :
                    entry.type === '已逾期' ? '#FAEEDA' :
                    entry.type === '进行中' ? '#E6F1FB' : '#f0f2f7',
                  color:
                    entry.type === '已完成' ? '#534AB7' :
                    entry.type === '已逾期' ? '#854F0B' :
                    entry.type === '进行中' ? '#185FA5' : '#6b7a93',
                }}>
                  {entry.type === '已完成' ? '已完成' : entry.type === '已逾期' ? '已逾期' : entry.type === '进行中' ? '进行中' : '待开始'}
                </span>
                <p style={{ fontSize: 13, fontWeight: 500, margin: '4px 0 1px 0' }}>
                  {entry.name}
                  {entry.sourceName && entry.sourceName !== project.name && (
                    <span style={{ fontSize: 10, fontWeight: 400, color: '#9aaec9', marginLeft: 6, background: '#f0f2f7', padding: '1px 6px', borderRadius: 8 }}>
                      来自 {entry.sourceName}
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: '#6b7a93', margin: 0 }}>
                  {entry.date ? `目标 ${entry.date}` : ''}{entry.description ? ` · ${entry.description}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== 层3: 任务清单 ====== */}
      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 500, fontSize: 13 }}>当前任务清单</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['全部', '进行中', '已完成', '有风险'].map(f => (
              <button
                key={f}
                onClick={() => setTaskFilter(f)}
                style={{
                  padding: '3px 10px', borderRadius: 8,
                  border: `0.5px solid ${taskFilter === f ? '#4F8EF7' : 'rgba(0,0,0,0.08)'}`,
                  background: taskFilter === f ? '#f0f5ff' : 'transparent',
                  color: taskFilter === f ? '#4F8EF7' : '#6b7a93',
                  fontSize: 11, cursor: 'pointer', fontWeight: taskFilter === f ? 500 : 400,
                }}
              >
                {f}
              </button>
            ))}
            {!isPublic && (
              <button
                className={shared.btnToolbar}
                onClick={onOpenPlanEditor}
                style={{ fontSize: 11, marginLeft: 4 }}
              >
                + 管理
              </button>
            )}
          </div>
        </div>

        {displayTasks.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7a93', fontSize: 13 }}>
            暂无任务数据
            {tasks.length === 0 && (
              <div style={{ marginTop: 8 }}>
                点击「+ 管理」添加项目级任务，或创建周报后自动生成
              </div>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#6b7a93', fontSize: 11, textAlign: 'left' }}>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '26%' }}>任务</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '10%' }}>状态</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '8%' }}>优先级</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '10%' }}>负责人</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '11%' }}>开始时间</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '11%' }}>截止日</th>
                <th style={{ padding: '8px 8px', fontWeight: 500 }}>进度</th>
              </tr>
            </thead>
            <tbody>
              {displayTasks.map((t) => (
                <tr key={t.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.04)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>{t.title}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <TaskPriorityBadge priority={t.priority} />
                  </td>
                  <td style={{ padding: '10px 8px', color: '#6b7a93' }}>{t.assignee}</td>
                  <td style={{ padding: '10px 8px', color: '#6b7a93', fontSize: 11 }}>
                    {t.startDate || '--'}
                  </td>
                  <td style={{
                    padding: '10px 8px',
                    color: t.deadline && t.deadline < today && t.status !== '已完成' ? '#D85A30' : '#6b7a93',
                  }}>
                    {t.deadline || '--'}
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${t.progress}%`, height: '100%',
                          background: t.status === '有风险' ? '#D85A30' : t.status === '已完成' ? '#639922' : '#378ADD',
                          borderRadius: 2,
                        }} />
                      </div>
                      <span style={{
                        fontSize: 11,
                        color: t.status === '有风险' ? '#D85A30' : '#6b7a93',
                      }}>
                        {t.status === '待开始' ? '--' : `${t.progress}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 信息层级说明 */}
      <p style={{ fontSize: 11, color: '#9aaec9', marginTop: 14, lineHeight: 1.6 }}>
        信息层级：顶部综合进度（见详情页统一栏）→ PMO/管理层快速扫读 → 中部子项目进度 + 里程碑 → 中层管理者追踪 → 底部任务清单 → 团队每日执行。一页打通三层视角。
      </p>
    </div>
  );
}

/** 任务状态 Badge */
function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; text: string }> = {
    '已完成': { bg: '#EAF3DE', color: '#3B6D11', text: '已完成' },
    '进行中': { bg: '#E1F5EE', color: '#0F6E56', text: '进行中' },
    '有风险': { bg: '#FAEEDA', color: '#854F0B', text: '有风险' },
    '待开始': { bg: '#f0f2f7', color: '#6b7a93', text: '待开始' },
  };
  const s = map[status] || map['待开始'];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8, fontSize: 11,
      background: s.bg, color: s.color, fontWeight: 500,
    }}>
      {s.text}
    </span>
  );
}

/** 优先级 Badge */
function TaskPriorityBadge({ priority }: { priority: string }) {
  return (
    <span style={{
      padding: '2px 6px', borderRadius: 4, fontSize: 11,
      background: priority === 'P0' ? '#FCEBEB' : priority === 'P1' ? '#FAEEDA' : '#f0f2f7',
      color: priority === 'P0' ? '#A32D2D' : priority === 'P1' ? '#854F0B' : '#6b7a93',
    }}>
      {priority}
    </span>
  );
}
