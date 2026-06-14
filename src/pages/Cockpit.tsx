import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getAllReports } from '../api/db';
import { Project } from '../types';
import styles from '../styles/cockpit.module.css';

// hex → {r, g, b}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// 状态对应的样式类
const STATUS_BADGE_CLASS: Record<string, string> = {
  '正常推进': styles.statusNormal,
  '需关注': styles.statusWarning,
  '存在风险': styles.statusDanger,
};

const RISK_LEVEL_CLASS: Record<string, string> = {
  '高': styles.riskLevelHigh,
  '中': styles.riskLevelMid,
  '低': styles.riskLevelLow,
};

const LEVEL_ORDER: Record<string, number> = { '高': 0, '中': 1, '低': 2 };

export default function Cockpit() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allReports, setAllReports] = useState<Awaited<ReturnType<typeof getAllReports>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState('');
  const navigate = useNavigate();

  // 自动刷新：60s
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projs, reps] = await Promise.all([getProjects(), getAllReports()]);
        if (!cancelled) {
          setProjects(projs);
          setAllReports(reps);
          const now = new Date();
          setLastRefreshTime(
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
          );
        }
      } catch {
        // 静默处理
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // 计算当前周（基于最新周报的 weekLabel 推算）
  const weekInfo = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = (d: Date) =>
      `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

    // 从所有周报中找最新一期，解析其 weekLabel 获取周数基准
    let latestWeekNum = 1;
    let latestMonday: Date | null = null;

    if (allReports.length > 0) {
      // 找出最新一期周报
      const latest = allReports.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
      const match = latest.weekLabel.match(/第(\d+)周/);
      if (match) {
        latestWeekNum = parseInt(match[1]);
      }
      if (latest.weekStart) {
        latestMonday = new Date(latest.weekStart + 'T00:00:00');
      }
    }

    // 基于最新周报推算当前周数
    let currentWeekNum = latestWeekNum;
    if (latestMonday) {
      const weeksDiff = Math.floor((monday.getTime() - latestMonday.getTime()) / (7 * 86400000));
      currentWeekNum = latestWeekNum + weeksDiff;
    }

    return {
      label: `第${Math.max(1, currentWeekNum)}周`,
      range: `${fmt(monday)} - ${fmt(friday)}`,
    };
  }, [allReports, refreshKey]);

  // 各项目统计
  const projectStats = useMemo(() => {
    return projects.map(p => {
      const prpts = allReports.filter(r => r.projectId === p.id);
      const latestReport =
        prpts.length > 0 ? prpts.reduce((a, b) => (a.weekStart > b.weekStart ? a : b)) : null;

      // 活跃风险（未解决/持续关注的）
      const activeRisks = latestReport?.risks.filter(
        r => r.status === '待处理' || r.status === '持续关注'
      ) || [];

      const riskSeen = new Set<string>();
      const allRisks = prpts.reduce<string[]>((acc, r) => {
        r.risks.forEach(rk => {
          const key = rk.description.trim();
          if (key && !riskSeen.has(key)) {
            riskSeen.add(key);
            acc.push(key);
          }
        });
        return acc;
      }, []);

      // 逾期检测
      let isOverdue = false;
      if (p.deadline && p.deadline.trim() !== '') {
        const today = new Date().toISOString().split('T')[0];
        if (p.deadline < today && (latestReport?.progress || 0) < 100) {
          isOverdue = true;
        }
      }

      return {
        project: p,
        reportCount: prpts.length,
        progress: latestReport?.progress || 0,
        activeRisks,
        allRiskCount: allRisks.length,
        isOverdue,
      };
    });
  }, [projects, allReports]);

  // KPI 指标
  const kpis = useMemo(() => {
    const totalProjects = projects.length;
    const overallProgress =
      totalProjects > 0
        ? Math.round(
            projectStats.reduce((sum, s) => sum + s.progress, 0) / totalProjects
          )
        : 0;

    // 活跃风险（跨项目去重）
    const activeRiskSet = new Set<string>();
    projectStats.forEach(s => {
      s.activeRisks.forEach(r => {
        const key = r.description.trim();
        if (key) activeRiskSet.add(key);
      });
    });
    const activeRiskCount = activeRiskSet.size;

    // 剩余计划
    const remainingPlans = projectStats.reduce((total, s) => {
      const prpts = allReports.filter(r => r.projectId === s.project.id);
      if (prpts.length === 0) return total;
      const latest = prpts.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
      return total + latest.plannedItems.filter(pi => !pi.carriedForward).length;
    }, 0);

    const overdueCount = projectStats.filter(s => s.isOverdue).length;

    return [
      { value: totalProjects, label: '在建项目', color: '#378ADD' },
      { value: `${overallProgress}%`, label: '整体进度', color: '#639922' },
      { value: activeRiskCount, label: '活跃风险', color: '#D85A30' },
      { value: remainingPlans, label: '剩余计划', color: '#7F77DD' },
      { value: overdueCount, label: '已逾期', color: '#D85A30' },
    ];
  }, [projects, projectStats, allReports]);

  // 活跃风险快照（跨项目，去重，按等级排序）
  const riskSnapshot = useMemo(() => {
    const seen = new Set<string>();
    const risks: {
      level: string;
      description: string;
      suggestion: string;
      projectName: string;
      projectColor: string;
    }[] = [];

    projects.forEach(p => {
      const prpts = allReports.filter(r => r.projectId === p.id);
      if (prpts.length === 0) return;
      const latest = prpts.reduce((a, b) => (a.weekStart > b.weekStart ? a : b));
      latest.risks.forEach(rk => {
        if (rk.status === '已解决') return;
        const key = `${p.id}::${rk.description.trim()}`;
        if (seen.has(key)) return;
        seen.add(key);
        risks.push({
          level: rk.level,
          description: rk.description,
          suggestion: rk.suggestion || '',
          projectName: p.name,
          projectColor: p.color,
        });
      });
    });

    risks.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));
    return risks;
  }, [projects, allReports]);

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.cockpit}>
      {/* 头部 */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>项目跟踪管理系统</h1>
        <span className={styles.headerWeek}>
          {weekInfo.label} · {weekInfo.range}
        </span>
      </header>

      {/* 顶部 KPI 横条 */}
      <section className={styles.kpiRow}>
        {kpis.map((kpi, i) => (
          <div key={i} className={styles.kpiCard}>
            <div className={styles.kpiValue} style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </section>

      {/* 项目快照 2×2 网格 */}
      {projects.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>暂无项目数据</div>
          <div>请在项目总览中添加项目后查看驾驶舱</div>
        </div>
      ) : (
        <section className={styles.projectGrid}>
          {projectStats.map(s => {
            const { r, g, b } = hexToRgb(s.project.color);
            const bg = `rgba(${r},${g},${b},0.06)`;
            const border = `1px solid rgba(${r},${g},${b},0.18)`;
            const statusCls = STATUS_BADGE_CLASS[s.project.status] || styles.statusNormal;

            return (
              <div
                key={s.project.id}
                className={styles.projectCard}
                style={{ background: bg, border }}
                onClick={() => navigate(`/project/${s.project.id}`)}
              >
                {/* 项目头 */}
                <div className={styles.projectCardHeader}>
                  <div className={styles.projectName}>
                    <span
                      className={styles.projectDot}
                      style={{ background: s.project.color }}
                    />
                    {s.project.name}
                    {s.isOverdue && (
                      <span className={styles.overdueBadge}>已逾期</span>
                    )}
                  </div>
                  <span className={`${styles.statusBadge} ${statusCls}`}>
                    {s.project.status}
                  </span>
                </div>

                {/* 项目元信息 */}
                <div className={styles.projectMeta}>
                  <span>负责人 {s.project.owner}</span>
                  {s.project.deadline && (
                    <span>截止 {s.project.deadline}</span>
                  )}
                </div>

                {/* 进度条 */}
                <div className={styles.progressSection}>
                  <div className={styles.progressLabel}>
                    <span className={styles.progressLabel} style={{ color: '#5a6e82', fontSize: 12 }}>
                      完成进度
                    </span>
                    <span
                      className={styles.progressPercent}
                      style={{ color: s.project.color }}
                    >
                      {s.progress}%
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${s.progress}%`,
                        background: s.project.color,
                      }}
                    />
                  </div>
                </div>

                {/* 底部统计 */}
                <div className={styles.projectStats}>
                  <div className={styles.projectStatItem}>
                    周报 <span className={styles.projectStatValue}>{s.reportCount}</span>期
                  </div>
                  <div className={styles.projectStatItem}>
                    风险 <span
                      className={styles.projectStatValue}
                      style={{ color: s.allRiskCount > 0 ? '#F0704A' : undefined }}
                    >
                      {s.allRiskCount}
                    </span>项
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* 活跃风险快照 */}
      {riskSnapshot.length > 0 && (
        <section className={styles.riskSection}>
          <div className={styles.riskHeader}>
            <h2 className={styles.riskTitle}>⚡ 活跃风险快照</h2>
            <span className={styles.riskCount}>共 {riskSnapshot.length} 项</span>
          </div>
          <div className={styles.riskList}>
            {riskSnapshot.map((risk, i) => {
              const { r, g, b } = hexToRgb(risk.projectColor);
              return (
                <div key={i} className={styles.riskItem}>
                  <span
                    className={`${styles.riskLevelBadge} ${RISK_LEVEL_CLASS[risk.level] || styles.riskLevelLow}`}
                  >
                    {risk.level}
                  </span>
                  <div className={styles.riskBody}>
                    <div className={styles.riskDescription}>{risk.description}</div>
                    {risk.suggestion && (
                      <div className={styles.riskSuggestion}>💡 {risk.suggestion}</div>
                    )}
                  </div>
                  <span
                    className={styles.riskProjectTag}
                    style={{
                      background: `rgba(${r},${g},${b},0.08)`,
                      color: risk.projectColor,
                    }}
                  >
                    {risk.projectName}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 底部时间戳 */}
      <footer className={styles.footer}>
        数据更新时间: {lastRefreshTime} · 每 60 秒自动刷新
      </footer>
    </div>
  );
}
