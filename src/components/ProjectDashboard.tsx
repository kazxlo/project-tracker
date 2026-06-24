import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project, WeeklyReport, Milestone, ProjectTask } from '../types';
import shared from '../styles/shared.module.css';

interface Props {
  project: Project;
  reports: WeeklyReport[];
  childProjects: Project[];
  allReports: WeeklyReport[];
  milestones: Milestone[];
  tasks: ProjectTask[];
  onOpenPlanEditor: () => void;
  getChildStats: (childId: string) => { reportCount: number; progress: number; riskCount: number };
}

export default function ProjectDashboard({
  project, reports, childProjects, allReports, milestones, tasks, onOpenPlanEditor, getChildStats,
}: Props) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  // ====== 层1数据 ======
  const latest = reports.length > 0
    ? reports.reduce((a, b) => a.weekStart > b.weekStart ? a : b)
    : null;

  // 综合进度：有子项目取子项目平均，否则取项目自身最新周报进度
  const overallProgress = childProjects.length > 0
    ? Math.round(childProjects.reduce((s, c) => s + getChildStats(c.id).progress, 0) / childProjects.length)
    : (latest?.progress || 0);

  // 本周完成数
  const weekCompleted = latest?.completedItems.length || 0;
  const prevWeekCompleted = (() => {
    if (reports.length < 2) return 0;
    const sorted = [...reports].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    return sorted[1]?.completedItems.length || 0;
  })();
  const weekDelta = weekCompleted - prevWeekCompleted;

  // 活跃风险数（全部子项目+自身，去重）
  const activeRisks = useMemo(() => {
    const seen = new Set<string>();
    const targets = [...childProjects, project];
    targets.forEach(p => {
      allReports.filter(r => r.projectId === p.id).forEach(r => {
        r.risks.forEach(rk => {
          if (rk.status !== '已解决') {
            const key = rk.description.trim();
            if (key) seen.add(key);
          }
        });
      });
    });
    return seen.size;
  }, [childProjects, allReports, project]);

  // 预计交付日 + 剩余天数
  const deliveryDate = project.serviceEnd || project.deadline || '';
  const remainingDays = deliveryDate
    ? Math.max(0, Math.ceil((new Date(deliveryDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000))
    : -1;

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

  // 里程碑数据处理
  const milestoneEntries = useMemo(() => {
    if (milestones.length > 0) {
      return milestones.map(m => ({
        type: m.status,
        name: m.name,
        date: m.targetDate || '',
        description: m.description || '',
      }));
    }
    // 无里程碑时用子项目关键日期近似
    const entries: { type: string; name: string; date: string; description: string }[] = [];
    // 已完成的子项目
    childProjects.filter(c => getChildStats(c.id).progress >= 95).forEach(c => {
      const end = c.serviceEnd || c.deadline || '';
      entries.push({ type: '已完成', name: `${c.name} 完成`, date: end, description: `进度 ${getChildStats(c.id).progress}%` });
    });
    // 截止日迫近的子项目 (deadline <= 2周)
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    const twoWeeksLaterStr = twoWeeksLater.toISOString().split('T')[0];
    childProjects.filter(c => {
      const dl = c.deadline || c.serviceEnd;
      return dl && dl >= today && dl <= twoWeeksLaterStr && getChildStats(c.id).progress < 95;
    }).forEach(c => {
      entries.push({ type: '进行中', name: `${c.name} 截止`, date: c.deadline || c.serviceEnd || '', description: `负责人: ${c.owner}` });
    });
    // 待开始
    childProjects.filter(c => c.serviceStart && c.serviceStart > today).forEach(c => {
      entries.push({ type: '待开始', name: `${c.name} 启动`, date: c.serviceStart || '', description: `负责人: ${c.owner}` });
    });
    if (deliveryDate) {
      entries.push({ type: '待开始', name: '最终交付', date: deliveryDate, description: remainingDays >= 0 ? `剩余 ${remainingDays} 天` : '' });
    }
    return entries;
  }, [milestones, childProjects, getChildStats, today, deliveryDate, remainingDays]);

  // ====== 层3数据：任务列表 ======
  const [taskFilter, setTaskFilter] = useState<string>('全部');

  const displayTasks = useMemo(() => {
    let list = tasks.length > 0 ? tasks : [];

    // 无任务时用子项目最新周报数据近似
    if (list.length === 0 && childProjects.length > 0) {
      childProjects.forEach(c => {
        const crpts = allReports.filter(r => r.projectId === c.id);
        if (crpts.length === 0) return;
        const clatest = crpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b);

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
  }, [tasks, childProjects, allReports, taskFilter]);

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ====== 层1: 标题 + 环形进度 + KPI卡 ====== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <span style={{ fontWeight: 500, fontSize: 15 }}>{project.name} · 项目驾驶舱</span>
          <div style={{ fontSize: 12, color: '#6b7a93', marginTop: 2 }}>
            {latest ? `${latest.weekLabel} · ${latest.weekEnd} 更新` : '暂无周报'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#6b7a93' }}>总体进度</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: overallProgress >= 80 ? '#639922' : overallProgress >= 50 ? '#378ADD' : '#D85A30' }}>
              {overallProgress}%
            </div>
          </div>
          <RingProgress pct={overallProgress} />
        </div>
      </div>

      {/* KPI 卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard
          label="综合进度"
          value={overallProgress}
          unit="%"
          sub={overallProgress >= 70 ? '进度正常' : overallProgress >= 40 ? '持续跟进' : '需重点关注'}
          subColor={overallProgress >= 70 ? '#639922' : overallProgress >= 40 ? '#378ADD' : '#D85A30'}
        />
        <KpiCard
          label="本周完成"
          value={weekCompleted}
          unit="项"
          sub={weekDelta > 0 ? `较上周 +${weekDelta}` : weekDelta < 0 ? `较上周 ${weekDelta}` : '与上周持平'}
          subColor="#639922"
        />
        <KpiCard
          label="风险/阻塞"
          value={activeRisks}
          unit=""
          sub={activeRisks > 0 ? '需管理层关注' : '无活跃风险'}
          subColor={activeRisks > 0 ? '#D85A30' : '#639922'}
          valueColor={activeRisks > 0 ? '#D85A30' : undefined}
        />
        <KpiCard
          label="预计交付"
          value={deliveryDate ? deliveryDate.slice(5) : '--'}
          unit=""
          sub={remainingDays >= 0 ? `剩余 ${remainingDays} 天` : deliveryDate ? '' : '未设置'}
          subColor={remainingDays <= 14 && remainingDays >= 0 ? '#D85A30' : '#6b7a93'}
        />
      </div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className={shared.btnToolbar}
                onClick={onOpenPlanEditor}
                style={{ fontSize: 11 }}
              >
                {milestones.length > 0 ? '编辑' : '+ 添加'}
              </button>
            </div>
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
              <div key={i} style={{ marginBottom: i < milestoneEntries.length - 1 ? 14 : 0, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: -18, top: 2, width: 10, height: 10, borderRadius: '50%',
                  background:
                    entry.type === '已完成' ? '#7F77DD' :
                    entry.type === '进行中' ? '#378ADD' : '#e5e7eb',
                  border: entry.type === '待开始' ? '1.5px solid #bfc8d6' : 'none',
                }} />
                <span style={{
                  fontSize: 11, padding: '1px 6px', borderRadius: 8, fontWeight: 500,
                  background:
                    entry.type === '已完成' ? '#EEEDFE' :
                    entry.type === '进行中' ? '#E6F1FB' : '#f0f2f7',
                  color:
                    entry.type === '已完成' ? '#534AB7' :
                    entry.type === '进行中' ? '#185FA5' : '#6b7a93',
                }}>
                  {entry.type === '已完成' ? '已完成' : entry.type === '进行中' ? '进行中' : '待开始'}
                </span>
                <p style={{ fontSize: 13, fontWeight: 500, margin: '4px 0 1px 0' }}>{entry.name}</p>
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
            <button
              className={shared.btnToolbar}
              onClick={onOpenPlanEditor}
              style={{ fontSize: 11, marginLeft: 4 }}
            >
              + 管理
            </button>
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
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '34%' }}>任务</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '12%' }}>状态</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '12%' }}>优先级</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '14%' }}>负责人</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '14%' }}>截止日</th>
                <th style={{ padding: '8px 8px', fontWeight: 500, width: '14%' }}>进度</th>
              </tr>
            </thead>
            <tbody>
              {displayTasks.map((t, idx) => (
                <tr key={t.id} style={{ borderTop: '0.5px solid rgba(0,0,0,0.04)' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>{t.title}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <TaskPriorityBadge priority={t.priority} />
                  </td>
                  <td style={{ padding: '10px 8px', color: '#6b7a93' }}>{t.assignee}</td>
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
        信息层级：顶部环形进度 + KPI卡 → PMO/管理层快速扫读 → 中部子项目进度 + 里程碑 → 中层管理者追踪 → 底部任务清单 → 团队每日执行。一页打通三层视角。
      </p>
    </div>
  );
}

/** 环形进度圈 */
function RingProgress({ pct }: { pct: number }) {
  const deg = (pct / 100) * 360;
  const color = pct >= 80 ? '#639922' : pct >= 50 ? '#378ADD' : '#D85A30';
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: `conic-gradient(${color} 0deg ${deg}deg, #e5e7eb ${deg}deg 360deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 500, color }}>{pct}%</span>
      </div>
    </div>
  );
}

/** KPI 卡片 */
function KpiCard({ label, value, unit, sub, subColor, valueColor }: {
  label: string; value: number | string; unit?: string;
  sub: string; subColor: string; valueColor?: string;
}) {
  return (
    <div style={{
      background: '#f8fafd', borderRadius: 16, padding: 14,
      border: '0.5px solid rgba(0,0,0,0.04)',
    }}>
      <p style={{ fontSize: 11, color: '#6b7a93', margin: '0 0 2px 0' }}>{label}</p>
      <p style={{
        fontSize: 26, fontWeight: 500, margin: '0 0 2px 0', color: valueColor || '#1c2a44',
      }}>
        {value}
        {unit && (
          <span style={{ fontSize: 15, color: '#6b7a93', fontWeight: 400 }}>{unit}</span>
        )}
      </p>
      <p style={{ fontSize: 11, color: subColor, margin: 0 }}>{sub}</p>
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
