import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getAllReports, getAllProjectTasks } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { getTodayStr, hexToRgb, getLatestReport } from '../utils/helpers';
import { filterVisibleProjects } from '../utils/helpers';
import type { Project, ProjectTask, WeeklyReport } from '../types';
import TopNav from '../components/TopNav';
import styles from '../styles/workspace.module.css';

// 状态颜色映射
const STATUS_CLASS: Record<string, string> = {
  '已完成': styles.taskDone,
  '进行中': styles.taskProgress,
  '待开始': styles.taskTodo,
  '有风险': styles.taskRisk,
};

/* ===== 日期/颜色工具（模块级） ===== */
const fmtShort = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtMonth = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月`;
};
const dateRange = (start: Date, end: Date, dayStep = 1) => {
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    const pad = (n: number) => String(n).padStart(2, '0');
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() + dayStep);
  }
  return dates;
};
const rgl = (r: number, g: number, b: number, a: number) => `rgba(${r},${g},${b},${a})`;
const barColorClass = (status: string): { dot: string; bg: string; border?: string } => {
  switch (status) {
    case '已完成': return { dot: '#639922', bg: 'rgba(99,153,34,0.25)' };
    case '有风险': return { dot: '#D85A30', bg: 'rgba(217,90,48,0.2)', border: 'solid' };
    case '待开始': return { dot: '#7F77DD', bg: 'rgba(127,119,221,0.18)', border: 'dashed' };
    default: return { dot: '#378ADD', bg: 'rgba(55,138,221,0.25)' };
  }
};
const getConflictTaskInfo = (taskId: string, conflicts: ConflictPair[]): ConflictPair[] => conflicts.filter(c => c.task1.id === taskId || c.task2.id === taskId);

/* ===== 类型 ===== */
interface ConflictPair {
  task1: ProjectTask;
  task2: ProjectTask;
  overlapDays: number;
}

interface ProjectGroup {
  project: Project;
  isOwner: boolean;
  tasks: ProjectTask[];
  allTasks: ProjectTask[];
  progress: number;
  latestReport: WeeklyReport | null;
}

export default function Workspace() {
  const { username, role, userId, doLogout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';

  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [projs, tasks, reps] = await Promise.all([
          getProjects(), getAllProjectTasks(), getAllReports(),
        ]);
        if (!cancelled) {
          // 按 viewerIds 过滤可见项目（admin 可见全部）
          setProjects(filterVisibleProjects(projs, userId, role));
          setAllTasks(tasks);
          setAllReports(reps);
        }
      } catch (e) {
        console.error('加载工作台数据失败:', e);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [userId, role]);

  // 当前日期
  const today = useMemo(() => getTodayStr(), []);

  // 我的任务（分配给我 + 关联的项目）
  const myTasks = useMemo(() => {
    return allTasks.filter(t => t.assignee === username);
  }, [allTasks, username]);

  // 我相关的项目组
  const projectGroups: ProjectGroup[] = useMemo(() => {
    const myTaskProjectIds = new Set(myTasks.map(t => t.projectId));
    const myProjects = projects.filter(p =>
      p.owner === username || myTaskProjectIds.has(p.id)
    );

    return myProjects.map(p => {
      const projectTasks = allTasks.filter(t => t.projectId === p.id);
      const prpts = allReports.filter(r => r.projectId === p.id);
      const latestReport = getLatestReport(prpts);

      // 我是负责人 → 显示所有任务；否则只显示我的任务
      const isOwner = p.owner === username;
      const visibleTasks = isOwner
        ? projectTasks
        : projectTasks.filter(t => t.assignee === username);

      return {
        project: p,
        isOwner,
        tasks: visibleTasks,
        allTasks: projectTasks,
        progress: latestReport?.progress || 0,
        latestReport,
      };
    });
  }, [projects, allTasks, allReports, username, myTasks]);

  // 按项目分组展示（子项目任务归集到父项目下，仅显示有任务的项目卡片）
  const displayProjectGroups = useMemo(() => {
    const childrenByParent = new Map<string, ProjectGroup[]>();
    const topGroups: ProjectGroup[] = [];
    projectGroups.forEach(g => {
      const pid = g.project.parentId;
      if (pid && projectGroups.some(pg => pg.project.id === pid)) {
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid)!.push(g);
      } else {
        topGroups.push(g);
      }
    });
    return topGroups
      .map(g => {
        const children = childrenByParent.get(g.project.id) || [];
        if (children.length === 0) return g;
        const mergedTasks = [...g.tasks, ...children.flatMap(c => c.tasks)];
        return { ...g, tasks: mergedTasks, allTasks: [...g.allTasks, ...children.flatMap(c => c.allTasks)] };
      })
      .filter(g => g.tasks.length > 0);
  }, [projectGroups]);

  // 冲突检测
  const conflicts: ConflictPair[] = useMemo(() => {
    const dated = myTasks.filter(
      t => t.startDate && t.deadline && t.status !== '已完成'
    );
    const result: ConflictPair[] = [];
    for (let i = 0; i < dated.length; i++) {
      for (let j = i + 1; j < dated.length; j++) {
        const a = dated[i], b = dated[j];
        if (a.startDate! <= b.deadline! && b.startDate! <= a.deadline!) {
          const overlapStart = a.startDate! > b.startDate! ? a.startDate! : b.startDate!;
          const overlapEnd = a.deadline! < b.deadline! ? a.deadline! : b.deadline!;
          const days = Math.round(
            (new Date(overlapEnd + 'T00:00:00').getTime() -
              new Date(overlapStart + 'T00:00:00').getTime()) /
            86400000
          );
          result.push({ task1: a, task2: b, overlapDays: days });
        }
      }
    }
    return result;
  }, [myTasks]);

  // 工作负荷分布（未来14天每天并发数）
  const workloadData = useMemo(() => {
    const days: { date: string; count: number; label: string }[] = [];
    const dated = myTasks.filter(
      t => t.startDate && t.deadline && t.status !== '已完成'
    );
    const now = new Date();
    for (let i = -1; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      const count = dated.filter(t =>
        t.startDate! <= ds && t.deadline! >= ds
      ).length;
      days.push({
        date: ds,
        count,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
    return days;
  }, [myTasks]);

  const maxWorkload = useMemo(() =>
    Math.max(...workloadData.map(d => d.count), 1),
    [workloadData]
  );

  // KPI 基于 displayProjectGroups
  const kpiData = useMemo(() => {
    const myProjectCount = displayProjectGroups.length;
    const activeTasks = myTasks.filter(t => t.status !== '已完成');
    const doneTasks = myTasks.filter(t => t.status === '已完成');
    const totalTasks = myTasks.length;

    // 本周到期
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const weekDue = activeTasks.filter(
      t => t.deadline && t.deadline >= today && t.deadline <= weekEndStr
    );

    // 冲突数
    const conflictTaskIds = new Set<string>();
    conflicts.forEach(c => {
      conflictTaskIds.add(c.task1.id);
      conflictTaskIds.add(c.task2.id);
    });

    // 负荷评估
    const peakLoad = Math.max(...workloadData.slice(0, 14).map(d => d.count), 0);
    let loadLabel: string;
    let loadColor: string;
    if (peakLoad >= 4) { loadLabel = '过高'; loadColor = '#ff6b6b'; }
    else if (peakLoad >= 2) { loadLabel = '偏高'; loadColor = '#EF9F27'; }
    else if (peakLoad >= 1) { loadLabel = '正常'; loadColor = '#4ade80'; }
    else { loadLabel = '空闲'; loadColor = '#9aaec9'; }

    return {
      myProjectCount,
      activeCount: activeTasks.length,
      totalTasks,
      doneCount: doneTasks.length,
      weekDueCount: weekDue.length,
      conflictCount: conflictTaskIds.size,
      peakLoad,
      loadLabel,
      loadColor,
      nextPeakInfo: peakLoad > 1 ? `近两周峰值 ${peakLoad} 项` : undefined,
    };
  }, [displayProjectGroups, myTasks, conflicts, workloadData, today]);

  // 时间线日期范围（从今天起近1个月，约30天等距刻度）
  const timelineRange = useMemo(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return dateRange(start, end);
  }, []);

  // 时间线上的全部任务（含已完成，所有我的任务中有日期的）
  const timelineTasks = useMemo(() => {
    return myTasks
      .filter(t => t.startDate || t.deadline)
      .sort((a, b) => {
        const aStart = a.startDate || a.deadline || '';
        const bStart = b.startDate || b.deadline || '';
        return aStart.localeCompare(bStart);
      });
  }, [myTasks]);

  // 日期刻度：在月初显示 "X月"，其他日期每7天显示 "M/D"
  const timelineTicks = useMemo(() => {
    return timelineRange.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return {
        date: d,
        label: dt.getDate() === 1 ? fmtMonth(d) : fmtShort(d),
        isMonthStart: dt.getDate() === 1,
      };
    });
  }, [timelineRange]);

  // 冲突任务ID集合
  const conflictTaskIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach(c => { ids.add(c.task1.id); ids.add(c.task2.id); });
    return ids;
  }, [conflicts]);

  const hasConflicts = conflicts.length > 0;

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  // 今天在时间线中的位置
  const totalTimelineDays = timelineRange.length;
  const todayIndex = timelineRange.indexOf(today);

  // 在时间线上定位任务色块的辅助
  const barPos = (dateStr: string) => {
    const idx = timelineRange.indexOf(dateStr);
    return idx >= 0 ? (idx / totalTimelineDays) * 100 : -1;
  };

  return (
    <div className={styles.workspace}>
      {/* 头部 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar}>{username.charAt(0)}</div>
          <div>
            <div className={styles.headerTitle}>
              {username} · 个人工作台
              {isAdmin && <span className={styles.adminBadge}>管理员</span>}
            </div>
            <div className={styles.headerDate}>
              今日 {new Date().getMonth() + 1}月{new Date().getDate()}日
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <TopNav active="workspace" theme="dark" styles={styles} />
          <span className={styles.userInfo}>
            {username}
            {isAdmin && <span className={styles.adminBadge}>管理员</span>}
          </span>
          <button className={styles.logoutBtn} onClick={() => { doLogout(); }}>
            退出
          </button>
        </div>
      </header>

      {/* KPI 卡片 */}
      <section className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>负责项目</div>
          <div className={styles.kpiValue}>
            {kpiData.myProjectCount}<span className={styles.kpiUnit}>个</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>待完成任务</div>
          <div className={styles.kpiValue}>
            {kpiData.activeCount}<span className={styles.kpiUnit}>/{kpiData.totalTasks}</span>
          </div>
          <div className={styles.kpiProgressBar}>
            <div
              className={styles.kpiProgressFill}
              style={{ width: `${kpiData.totalTasks > 0 ? Math.round((kpiData.doneCount / kpiData.totalTasks) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>本周到期</div>
          <div className={styles.kpiValue} style={{ color: kpiData.weekDueCount > 0 ? '#EF9F27' : '#4ade80' }}>
            {kpiData.weekDueCount}<span className={styles.kpiUnit}>项</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>时间冲突</div>
          <div className={styles.kpiValue} style={{ color: kpiData.conflictCount > 0 ? '#F0997B' : '#4ade80' }}>
            {kpiData.conflictCount}<span className={styles.kpiUnit}>项</span>
          </div>
          {kpiData.conflictCount > 0 && (
            <div className={styles.kpiHint} style={{ color: '#F0997B' }}>需调整排期</div>
          )}
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>工作负荷</div>
          <div className={styles.kpiValue} style={{ color: kpiData.loadColor }}>
            {kpiData.loadLabel}
          </div>
          {kpiData.nextPeakInfo && (
            <div className={styles.kpiHint}>{kpiData.nextPeakInfo}</div>
          )}
        </div>
      </section>

      {/* 主体双栏 */}
      <div className={styles.mainGrid}>
        {/* 左侧：时间线 */}
        <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>跨项目任务时间线</span>
            {hasConflicts && <span className={styles.conflictBadge}>{conflicts.length}项冲突</span>}
          </div>
          <div className={styles.timelineWrap}>
            {/* 日期刻度：月初显示 "X月"，每7天显示一次 */}
            <div className={styles.timelineScale2}>
              <div className={styles.timelineLabelSpacer} />
              <div className={styles.timelineLabels2}>
                {timelineRange.map((d, i) => {
                  const dt = new Date(d + 'T00:00:00');
                  const isFirst = dt.getDate() === 1;
                  const isWeek = dt.getDay() === 1; // 周一
                  const show = isFirst || isWeek || d === timelineRange[0];
                  if (!show) return <div key={i} style={{ flex: 1, minWidth: 0 }} />;
                  return <div key={i} style={{ flex: 1, minWidth: 0, fontSize: 10, color: rgl(255,255,255,0.4), textAlign: 'center', whiteSpace: 'nowrap' }}>{isFirst ? fmtMonth(d) : fmtShort(d)}</div>;
                })}
              </div>
            </div>
            {/* 任务行 */}
            <div className={styles.timelineBody}>
              {timelineTasks.length === 0 ? (
                <div className={styles.timelineBarEmpty}>暂无待完成任务</div>
              ) : (
                timelineTasks.map(t => {
                  const start = t.startDate || t.deadline || '';
                  const end = t.deadline || t.startDate || '';
                  const leftPct = barPos(start);
                  const rightPct = barPos(end);
                  const isFixed = leftPct >= 0 && rightPct >= 0;
                  const wPct = isFixed ? Math.max(1, rightPct - leftPct) : 4;
                  const isConflict = conflictTaskIds.has(t.id);
                  const barStyle = barColorClass(t.status);

                  return (
                    <div key={t.id} className={`${styles.timelineBarRow} ${isConflict ? styles.timelineBarRowConflict : ''}`}>
                      <div className={styles.timelineTaskName}>
                        <span className={styles.taskDot} style={{ background: barStyle.dot }} />
                        <span className={styles.taskTitleText} title={t.title}>{t.title}</span>
                      </div>
                      <div className={styles.timelineBarArea}>
                        {/* 冲突区域背景 */}
                        {isConflict && <div className={styles.timelineConflictOverlay}>{getConflictTaskInfo(t.id, conflicts).length > 1 ? '冲突' : ''}</div>}
                        {/* 今日竖线 */}
                        {todayIndex >= 0 && <div className={styles.todayLine} style={{ left: `${((todayIndex + 0.5) / totalTimelineDays) * 100}%` }} />}
                        {isFixed && (
                          <div
                            className={styles.timelineBar2}
                            style={{
                              left: `${leftPct}%`,
                              width: `${wPct}%`,
                              background: barStyle.bg,
                              borderLeft: barStyle.border ? `2px ${barStyle.border} ${barStyle.dot}` : 'none',
                            }}
                          >
                            <span className={styles.timelineBarLabel2}>{fmtShort(start)}{end && end !== start ? ` ~ ${fmtShort(end)}` : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 右侧：工作量分布 — 高度自适应与左栏等高 */}
        <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>近期工作量分布</span>
          </div>
          <div className={styles.workloadChartFull}>
            {workloadData.map((d, i) => {
              const barH = d.count > 0 ? Math.max(8, (d.count / maxWorkload) * 100) + '%' : '4px';
              const isPeak = d.count === maxWorkload && d.count > 0;
              const isToday = d.date === today;
              const barColor = d.count >= 4 ? styles.barOverload : d.count >= 2 ? styles.barNormal : d.count >= 1 ? styles.barLight : styles.barEmpty;
              return (
                <div key={i} className={styles.barColFull}>
                  {isPeak && d.count >= 3 && <div className={styles.barPeakLabel}>峰值</div>}
                  <div className={`${styles.barFull} ${barColor}`} style={{ height: barH }}><span className={styles.barCount}>{d.count > 0 ? d.count : ''}</span></div>
                  <span className={`${styles.barDate} ${isToday ? styles.barDateToday : ''}`}>{d.label}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.chartLegend}>
            <span><span className={styles.legendDot} style={{ background: 'rgba(55,138,221,0.5)' }} />正常</span>
            <span><span className={styles.legendDot} style={{ background: 'rgba(217,90,48,0.5)' }} />超负荷</span>
          </div>
        </div>
      </div>

      {/* 按项目分组 — 子项目归集到父项目，仅显示有任务的项目 */}
      <section className={styles.projectGroups}>
        {displayProjectGroups.map(g => {
          const color = g.project.color;
          const { r, g: gn, b } = hexToRgb(color);
          return (
            <div key={g.project.id} className={styles.projectCard} style={{ borderTopColor: color }}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <span className={styles.cardProjectName}>{g.project.name}</span>
                  <span className={styles.cardRoleBadge} style={{ background: g.isOwner ? `rgba(${r},${gn},${b},0.18)` : 'rgba(99,153,34,0.18)', color: g.isOwner ? color : '#97C459' }}>{g.isOwner ? '负责人' : '参与'}</span>
                </div>
                <span className={styles.cardProgress}>进度 {g.progress}%</span>
              </div>
              <div className={styles.cardProgressBar}><div className={styles.cardProgressFill} style={{ width: `${g.progress}%`, background: color }} /></div>
              <div className={styles.cardTaskList}>
                {g.tasks.map(t => {
                  const statusCls = STATUS_CLASS[t.status] || styles.taskTodo;
                  const isConflict = conflictTaskIds.has(t.id);
                  return (
                    <div key={t.id} className={`${styles.cardTask} ${isConflict ? styles.cardTaskConflict : ''}`}>
                      <span className={styles.cardTaskDot} style={{ background: t.status === '已完成' ? '#639922' : isConflict ? '#D85A30' : t.status === '有风险' ? '#D85A30' : t.status === '进行中' ? '#378ADD' : 'rgba(255,255,255,0.2)' }} />
                      <span className={styles.cardTaskTitle}>{t.title}</span>
                      <span className={`${styles.cardTaskStatus} ${statusCls}`}>{isConflict ? `${t.priority}·冲突` : t.status}</span>
                      {t.deadline && <span className={`${styles.cardTaskDate} ${isConflict ? styles.cardTaskDateConflict : ''}`}>{fmtShort(t.deadline)}</span>}
                    </div>
                  );
                })}
              </div>
              <div className={styles.cardFooter} onClick={() => navigate(`/project/${g.project.id}`)}>查看项目详情 →</div>
            </div>
          );
        })}
      </section>

      {/* 冲突提醒 */}
      {hasConflicts && (
        <div className={styles.conflictAlert}>
          <span className={styles.conflictAlertIcon}>⚠️</span>
          <div className={styles.conflictAlertBody}>
            <div className={styles.conflictAlertTitle}>时间冲突提醒</div>
            <div className={styles.conflictAlertText}>
              {conflicts.map((c, i) => (<span key={i}>「{c.task1.title}」({projects.find(p => p.id === c.task1.projectId)?.name || '未知项目'}) 与 「{c.task2.title}」({projects.find(p => p.id === c.task2.projectId)?.name || '未知项目'}) 重叠 {c.overlapDays} 天{i < conflicts.length - 1 ? '；' : ''}</span>))}。建议与相关项目负责人协调排期。
            </div>
          </div>
          <button className={styles.conflictBtn} onClick={() => { const fp = displayProjectGroups[0]; if (fp) navigate(`/project/${fp.project.id}`); }}>查看详情</button>
        </div>
      )}

      {/* 空状态 */}
      {displayProjectGroups.length === 0 && (
        <div className={styles.emptyState}><div className={styles.emptyTitle}>暂未参与任何项目</div><div>你尚未被分配任何任务或负责任何项目。请联系管理员分配任务。</div></div>
      )}
    </div>
  );
}
