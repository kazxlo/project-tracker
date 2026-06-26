import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getProjects, getAllReports, getAllProjectTasks } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { Project, ProjectTask, WeeklyReport } from '../types';
import styles from '../styles/workspace.module.css';

// 状态颜色映射
const STATUS_CLASS: Record<string, string> = {
  '已完成': styles.taskDone,
  '进行中': styles.taskProgress,
  '待开始': styles.taskTodo,
  '有风险': styles.taskRisk,
};

const PRIORITY_COLOR: Record<string, string> = {
  'P0': '#D85A30',
  'P1': '#EF9F27',
  'P2': '#9aaec9',
};

// 冲突对类型
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
  const { username, role, doLogout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';

  const [projects, setProjects] = useState<Project[]>([]);
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('全部项目');
  const [timeRange, setTimeRange] = useState('未来30天');

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [projs, tasks, reps] = await Promise.all([
          getProjects(), getAllProjectTasks(), getAllReports(),
        ]);
        if (!cancelled) {
          setProjects(projs);
          setAllTasks(tasks);
          setAllReports(reps);
        }
      } catch { /* 静默处理 */ }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // 当前日期
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

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
      const latestReport = prpts.length > 0
        ? prpts.reduce((a, b) => (a.weekStart > b.weekStart ? a : b))
        : null;

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

  // 筛选器选项
  const projectNames = useMemo(() => {
    return ['全部项目', ...projectGroups.map(g => g.project.name)];
  }, [projectGroups]);

  // 时间范围过滤后的任务（用于时间线和Gantt）
  const timeFilteredTasks = useMemo(() => {
    let bounds: { start: string; end: string } | null = null;
    const now = new Date();
    if (timeRange === '未来14天') {
      const end = new Date(now);
      end.setDate(end.getDate() + 14);
      bounds = { start: today, end: end.toISOString().split('T')[0] };
    } else if (timeRange === '未来30天') {
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      bounds = { start: today, end: end.toISOString().split('T')[0] };
    }

    let tasks = myTasks.filter(t => t.status !== '已完成');
    if (projectFilter !== '全部项目') {
      const proj = projectGroups.find(g => g.project.name === projectFilter);
      if (proj) {
        tasks = tasks.filter(t => t.projectId === proj.project.id);
      }
    }
    if (bounds) {
      tasks = tasks.filter(t => {
        if (!t.startDate && !t.deadline) return false;
        const s = t.startDate || t.deadline!;
        const e = t.deadline || t.startDate!;
        return s <= bounds.end && e >= bounds.start;
      });
    }
    return tasks;
  }, [myTasks, timeRange, projectFilter, projectGroups, today]);

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

  // KPI 统计
  const kpiData = useMemo(() => {
    const myProjectCount = projectGroups.length;
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
  }, [projectGroups, myTasks, conflicts, workloadData, today]);

  // 时间线日期范围（未来30天）
  const timelineRange = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 3);
    const end = new Date();
    end.setDate(end.getDate() + 27);
    const dates: string[] = [];
    const d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, []);

  // 时间线上的任务位置
  const timelineTasks = useMemo(() => {
    const active = myTasks.filter(t => t.status !== '已完成');
    return active
      .filter(t => t.startDate || t.deadline)
      .sort((a, b) => {
        const aStart = a.startDate || a.deadline || '';
        const bStart = b.startDate || b.deadline || '';
        return aStart.localeCompare(bStart);
      });
  }, [myTasks]);

  // 冲突任务ID集合
  const conflictTaskIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach(c => { ids.add(c.task1.id); ids.add(c.task2.id); });
    return ids;
  }, [conflicts]);

  // 是否有冲突
  const hasConflicts = conflicts.length > 0;

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  // 格式化日期
  const fmtShort = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // 今天在时间线中的位置
  const totalTimelineDays = timelineRange.length;
  const todayIndex = timelineRange.indexOf(today);

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
          <select
            className={styles.filterSelect}
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
          >
            {projectNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
          >
            <option value="未来30天">未来30天</option>
            <option value="未来14天">未来14天</option>
            <option value="全部">全部</option>
          </select>
          <Link to="/" className={styles.navLink}>驾驶舱</Link>
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
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>跨项目任务时间线</span>
            {hasConflicts && (
              <span className={styles.conflictBadge}>{conflicts.length}项冲突</span>
            )}
          </div>
          <div className={styles.timelineArea}>
            {/* 日期刻度 */}
            <div className={styles.timelineScale}>
              <div className={styles.timelineLabelSpacer} />
              <div className={styles.timelineLabels}>
                {timelineRange.map((d, i) => {
                  const isToday = d === today;
                  if (i % 4 !== 0 && !isToday) return <div key={i} className={styles.timelineLabel} />;
                  return (
                    <div
                      key={i}
                      className={`${styles.timelineLabel} ${isToday ? styles.timelineLabelToday : ''}`}
                    >
                      {fmtShort(d)}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* 今日竖线 */}
            {todayIndex >= 0 && (
              <div className={styles.todayLine} style={{ left: `calc(${((todayIndex + 0.5) / totalTimelineDays) * 100}% + 100px)` }} />
            )}
            {/* 任务行 */}
            {timelineTasks.length === 0 ? (
              <div className={styles.timelineEmpty}>暂无待完成任务</div>
            ) : (
              timelineTasks.map((t, ti) => {
                const start = t.startDate || t.deadline || '';
                const end = t.deadline || t.startDate || '';
                const startIdx = Math.max(0, timelineRange.indexOf(start));
                const endIdx = end ? Math.min(totalTimelineDays - 1, timelineRange.indexOf(end)) : startIdx + 3;
                const left = `${((startIdx + 0.1) / totalTimelineDays) * 100}%`;
                const width = `${Math.max(1, ((endIdx - startIdx + 0.8) / totalTimelineDays) * 100)}%`;
                const isConflict = conflictTaskIds.has(t.id);
                const project = projects.find(p => p.id === t.projectId);
                const isOverdue = t.deadline && t.deadline < today && t.status !== '已完成';

                return (
                  <div
                    key={t.id}
                    className={`${styles.timelineRow} ${isConflict ? styles.timelineRowConflict : ''}`}
                  >
                    <div className={styles.timelineTaskName}>
                      <span
                        className={styles.taskDot}
                        style={{
                          background: t.status === '已完成' ? '#639922'
                            : t.status === '有风险' ? '#D85A30'
                            : '#378ADD',
                        }}
                      />
                      <span className={styles.taskTitleText} title={t.title}>{t.title}</span>
                    </div>
                    <div className={styles.timelineBarArea}>
                      <div
                        className={`${styles.timelineBar} ${
                          t.status === '已完成' ? styles.timelineBarDone
                            : isConflict ? styles.timelineBarConflict
                            : isOverdue ? styles.timelineBarOverdue
                            : t.status === '有风险' ? styles.timelineBarRisk
                            : t.status === '待开始' ? styles.timelineBarTodo
                            : styles.timelineBarActive
                        }`}
                        style={{ left, width }}
                      >
                        <span className={styles.timelineBarLabel}>
                          {t.status === '已完成' ? `已完成` : `${t.priority}·${fmtShort(t.deadline || '')}`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：工作量分布 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>近期工作量分布</span>
          </div>
          <div className={styles.workloadChart}>
            {workloadData.map((d, i) => {
              const height = d.count > 0 ? Math.max(24, (d.count / maxWorkload) * 120) : 8;
              const isPeak = d.count === maxWorkload && d.count > 0;
              const isToday = d.date === today;
              const barColor = d.count >= 4 ? styles.barOverload
                : d.count >= 2 ? styles.barNormal
                : d.count >= 1 ? styles.barLight
                : styles.barEmpty;

              return (
                <div key={i} className={styles.barCol}>
                  {isPeak && d.count >= 3 && <div className={styles.barPeakLabel}>峰值</div>}
                  <div
                    className={`${styles.bar} ${barColor}`}
                    style={{ height: `${height}px` }}
                  >
                    <span className={styles.barCount}>{d.count > 0 ? d.count : ''}</span>
                  </div>
                  <span className={`${styles.barDate} ${isToday ? styles.barDateToday : ''}`}>
                    {d.label}
                  </span>
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

      {/* 按项目分组 */}
      <section className={styles.projectGroups}>
        {projectGroups.map(g => {
          const color = g.project.color;
          const { r, g: gn, b } = (() => {
            const h = color.replace('#', '');
            return {
              r: parseInt(h.substring(0, 2), 16),
              g: parseInt(h.substring(2, 4), 16),
              b: parseInt(h.substring(4, 6), 16),
            };
          })();

          return (
            <div
              key={g.project.id}
              className={styles.projectCard}
              style={{ borderTopColor: color }}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardTitleRow}>
                  <span className={styles.cardProjectName}>{g.project.name}</span>
                  <span
                    className={styles.cardRoleBadge}
                    style={{
                      background: g.isOwner
                        ? `rgba(${r},${gn},${b},0.18)`
                        : 'rgba(99,153,34,0.18)',
                      color: g.isOwner ? color : '#97C459',
                    }}
                  >
                    {g.isOwner ? '负责人' : '参与'}
                  </span>
                </div>
                <span className={styles.cardProgress}>进度 {g.progress}%</span>
              </div>
              <div className={styles.cardProgressBar}>
                <div
                  className={styles.cardProgressFill}
                  style={{ width: `${g.progress}%`, background: color }}
                />
              </div>
              <div className={styles.cardTaskList}>
                {g.tasks.length === 0 ? (
                  <div className={styles.cardTaskEmpty}>暂无任务</div>
                ) : (
                  g.tasks.map(t => {
                    const statusCls = STATUS_CLASS[t.status] || styles.taskTodo;
                    const isConflict = conflictTaskIds.has(t.id);
                    const project = projects.find(p => p.id === t.projectId);
                    return (
                      <div
                        key={t.id}
                        className={`${styles.cardTask} ${isConflict ? styles.cardTaskConflict : ''}`}
                      >
                        <span
                          className={styles.cardTaskDot}
                          style={{
                            background: t.status === '已完成' ? '#639922'
                              : isConflict ? '#D85A30'
                              : t.status === '有风险' ? '#D85A30'
                              : t.status === '进行中' ? '#378ADD'
                              : 'rgba(255,255,255,0.2)',
                          }}
                        />
                        <span className={styles.cardTaskTitle}>{t.title}</span>
                        <span className={`${styles.cardTaskStatus} ${statusCls}`}>
                          {isConflict ? `${t.priority}·冲突` : t.status}
                        </span>
                        {t.deadline && (
                          <span className={`${styles.cardTaskDate} ${isConflict ? styles.cardTaskDateConflict : ''}`}>
                            {fmtShort(t.deadline)}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div
                className={styles.cardFooter}
                onClick={() => navigate(`/project/${g.project.id}`)}
              >
                查看项目详情 →
              </div>
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
              {conflicts.map((c, i) => (
                <span key={i}>
                  「{c.task1.title}」
                  ({projects.find(p => p.id === c.task1.projectId)?.name || '未知项目'})
                  与 「{c.task2.title}」
                  ({projects.find(p => p.id === c.task2.projectId)?.name || '未知项目'})
                  重叠 {c.overlapDays} 天
                  {i < conflicts.length - 1 ? '；' : ''}
                </span>
              ))}
              。建议与相关项目负责人协调排期。
            </div>
          </div>
          <button
            className={styles.conflictBtn}
            onClick={() => {
              const firstProj = projectGroups[0];
              if (firstProj) navigate(`/project/${firstProj.project.id}`);
            }}
          >
            查看详情
          </button>
        </div>
      )}

      {/* 空状态 */}
      {projectGroups.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>暂未参与任何项目</div>
          <div>你尚未被分配任何任务或负责任何项目。请联系管理员分配任务。</div>
        </div>
      )}
    </div>
  );
}
