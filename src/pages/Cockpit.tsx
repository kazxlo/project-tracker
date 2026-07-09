import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getAllReports, updateRiskStatus, getAllMilestones, getAllProjectTasks } from '../api/db';
import { exportWeeklySummaryPDF } from '../utils/pdfExport';
import { useAuth } from '../hooks/useAuth';
import { getTodayStr, hexToRgb, formatDate, getLatestReport, calcOverallProgress, filterVisibleProjects } from '../utils/helpers';
import type { Project, Milestone, ProjectTask, WeeklyReport } from '../types';
import ProjectExportModal from '../components/ProjectExportModal';
import Icon from '../components/Icon';
import styles from '../styles/cockpit.module.css';

// YYYY-MM-DD → YYYY.MM.DD（本地 fmtDate 别名，复用 helpers.formatDate）
const fmtDate = formatDate;

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
  const [allMilestones, setAllMilestones] = useState<Milestone[]>([]);
  const [allTasks, setAllTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<'risks' | 'plans' | null>(null);
  const [savingRiskKey, setSavingRiskKey] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const { username, role, userId } = useAuth();
  const isAdmin = role === 'admin';
  const isMember = role === 'member';
  const canEdit = isAdmin || isMember;
  const navigate = useNavigate();

  // 加载数据
  const loadData = async () => {
    try {
      const [projs, reps, mss, tss] = await Promise.all([
        getProjects(), getAllReports(), getAllMilestones(), getAllProjectTasks(),
      ]);
      setProjects(filterVisibleProjects(projs, userId, role));
      setAllReports(reps);
      setAllMilestones(mss);
      setAllTasks(tss);
    } catch (e) {
      console.error('加载驾驶舱数据失败:', e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadData();
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);




  // 各项目统计（仅顶层项目）
  const projectStats = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    return topProjects.map(p => {
      const childProjects = projects.filter(c => c.parentId === p.id);
      const prpts = allReports.filter(r => r.projectId === p.id);
      const latestReport = getLatestReport(prpts);
      const hasChildren = childProjects.length > 0;

      // 活跃风险（未解决/持续关注的）—— 包含自身和子项目
      const riskSeen = new Set<string>();
      const allRiskCount = (() => {
        let count = 0;
        const targets = hasChildren ? [p, ...childProjects] : [p];
        targets.forEach(proj => {
          const rpts = allReports.filter(r => r.projectId === proj.id);
          rpts.forEach(r => {
            r.risks.forEach(rk => {
              if (rk.status === '已解决') return;
              const key = rk.description.trim();
              if (key && !riskSeen.has(key)) {
                riskSeen.add(key);
                count++;
              }
            });
          });
        });
        return count;
      })();

      const activeRisks = latestReport?.risks.filter(
        r => r.status === '待处理' || r.status === '持续关注'
      ) || [];

      // 进度：有子项目时仅聚合子项目（里程碑优先），无子项目时取自身统一进度（里程碑优先）
      let progress = calcOverallProgress(p, allReports, childProjects, projects, allMilestones, allTasks);
      let totalReports = prpts.length;
      if (hasChildren) {
        childProjects.forEach(c => {
          totalReports += allReports.filter(r => r.projectId === c.id).length;
        });
      }

      // 逾期检测
      const today = getTodayStr();
      let isOverdue = false;
      if (p.deadline && p.deadline.trim() !== '') {
        if (p.deadline < today && progress < 100) {
          isOverdue = true;
        }
      }

      // 最近里程碑（含子项目，取未来最近一个）
      const projectIds = hasChildren ? [p.id, ...childProjects.map(c => c.id)] : [p.id];
      const nearestMilestone = (() => {
        const ms = allMilestones
          .filter(m => projectIds.includes(m.projectId) && m.status !== '已完成' && m.targetDate && m.targetDate >= today)
          .sort((a, b) => (a.targetDate! > b.targetDate! ? 1 : -1));
        return ms.length > 0 ? { name: ms[0].name, targetDate: ms[0].targetDate! } : null;
      })();

      // 近15天任务（含子项目）
      const day15 = new Date();
      day15.setDate(day15.getDate() + 15);
      const day15Str = day15.toISOString().split('T')[0];
      const upcomingTasks = allTasks
        .filter(t =>
          projectIds.includes(t.projectId) &&
          t.status !== '已完成' &&
          t.deadline &&
          t.deadline >= today &&
          t.deadline <= day15Str
        )
        .sort((a, b) => (a.deadline! > b.deadline! ? 1 : -1))
        .map(t => ({ title: t.title, deadline: t.deadline! }));

      return {
        project: p,
        reportCount: totalReports,
        progress,
        activeRisks,
        allRiskCount,
        isOverdue,
        hasChildren,
        childCount: childProjects.length,
        nearestMilestone,
        upcomingTasks,
      };
    });
  }, [projects, allReports, allMilestones, allTasks]);

  // KPI 指标 + 下钻详情
  const kpiData = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    const totalProjects = topProjects.length;
    const overallProgress =
      totalProjects > 0
        ? Math.round(
            projectStats.reduce((sum, s) => sum + s.progress, 0) / totalProjects
          )
        : 0;

    const overdueCount = projectStats.filter(s => s.isOverdue).length;

    // 当前累计风险：所有周报中状态≠已解决的风险，跨项目去重
    const cumulativeRiskSet = new Set<string>();
    const cumulativeRiskDetails: {
      level: string; description: string; suggestion: string;
      projectName: string; projectColor: string; projectId: string;
      weekLabel: string; weekStart: string; status: string;
    }[] = [];
    projects.forEach(p => {
      const prpts = allReports.filter(r => r.projectId === p.id);
      prpts.forEach(rpt => {
        rpt.risks.forEach(rk => {
          if (rk.status === '已解决') return;
          const key = `${p.id}::${rk.description.trim()}`;
          if (!rk.description.trim() || cumulativeRiskSet.has(key)) return;
          cumulativeRiskSet.add(key);
          cumulativeRiskDetails.push({
            level: rk.level,
            description: rk.description,
            suggestion: rk.suggestion || '',
            projectName: p.name,
            projectColor: p.color,
            projectId: p.id,
            weekLabel: rpt.weekLabel,
            weekStart: rpt.weekStart,
            status: rk.status,
          });
        });
      });
    });
    cumulativeRiskDetails.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));

    // 剩余计划（各项目最新一期计划事项中未标记 carriedForward）
    const planDetails: { title: string; projectName: string; projectColor: string; weekLabel: string; weekStart: string }[] = [];
    let remainingPlans = 0;
    projects.forEach(p => {
      const prpts = allReports.filter(r => r.projectId === p.id);
      if (prpts.length === 0) return;
      const latest = getLatestReport(prpts)!;
      latest.plannedItems.filter(pi => !pi.carriedForward).forEach(pi => {
        remainingPlans++;
        planDetails.push({
          title: pi.title,
          projectName: p.name,
          projectColor: p.color,
          weekLabel: latest.weekLabel,
          weekStart: latest.weekStart,
        });
      });
    });

    const kpis = [
      { key: 'projects', value: totalProjects, label: '在建项目', color: '#5B9EF5', clickable: false },
      { key: 'progress', value: `${overallProgress}%`, label: '整体进度', color: 'var(--color-success)', clickable: false },
      { key: 'risks', value: cumulativeRiskSet.size, label: '当前累计风险', color: 'var(--color-danger)', clickable: true },
      { key: 'plans', value: remainingPlans, label: '剩余计划', color: 'var(--color-primary)', clickable: true },
      { key: 'overdue', value: overdueCount, label: '已逾期', color: 'var(--color-warning)', clickable: false },
    ];

    return { kpis, cumulativeRiskDetails, planDetails };
  }, [projects, projectStats, allReports]);

  // 高风险快照（仅高等级，用于页面下方展示）
  const highRisks = useMemo(() => {
    return kpiData.cumulativeRiskDetails.filter(r => r.level === '高');
  }, [kpiData.cumulativeRiskDetails]);

  // 风险状态变更
  const handleRiskStatusChange = async (projectId: string, description: string, newStatus: string) => {
    const key = `${projectId}::${description}`;
    setSavingRiskKey(key);
    try {
      await updateRiskStatus(projectId, description, newStatus as '待处理' | '已解决' | '持续关注');
      await loadData();
    } catch (err) {
      console.error('更新风险状态失败:', err);
    } finally {
      setSavingRiskKey(null);
    }
  };

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  return (
    <div className={styles.cockpit}>
      {/* 导出按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className={styles.pdfBtn} onClick={() => setShowExportModal(true)}>
          导出PDF
        </button>
      </div>

      {/* 顶部 KPI 横条 */}
      <section className={styles.kpiRow}>
        {kpiData.kpis.map((kpi, i) => (
          <div
            key={i}
            className={`${styles.kpiCard} ${kpi.clickable ? styles.kpiClickable : ''}`}
            onClick={() => {
              if (kpi.clickable && kpi.key === 'risks') setDrillDown('risks');
              if (kpi.clickable && kpi.key === 'plans') setDrillDown('plans');
            }}
          >
            <div className={styles.kpiValue} style={{ color: kpi.color }}>
              {kpi.value}
            </div>
            <div className={styles.kpiLabel}>{kpi.label}</div>
          </div>
        ))}
      </section>

      {/* 项目快照 2×2 网格 */}
      {projectStats.length === 0 ? (
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
            // 服务期进度
            const svcProgress = (() => {
              if (!s.project.serviceStart || !s.project.serviceEnd) return null;
              const today = getTodayStr();
              const st = new Date(s.project.serviceStart + 'T00:00:00').getTime();
              const ed = new Date(s.project.serviceEnd + 'T00:00:00').getTime();
              const nw = new Date(today + 'T00:00:00').getTime();
              if (nw < st) return 0;
              if (nw > ed) return 100;
              return Math.round(((nw - st) / (ed - st)) * 100);
            })();
            const svcExpired = s.project.serviceEnd ? s.project.serviceEnd < getTodayStr() : false;

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
                    {s.hasChildren && (
                      <span className={styles.parentBadge}>{s.childCount}个子项目</span>
                    )}
                  </div>
                  <span className={`${styles.statusBadge} ${statusCls}`}>
                    {s.project.status}
                  </span>
                </div>

                {/* 项目元信息 */}
                <div className={styles.projectMeta}>
                  <span>负责人 {s.project.owner}</span>
                  {s.project.deadline && !s.hasChildren && (
                    <span>截止 {s.project.deadline}</span>
                  )}
                </div>

                {/* 进度条 */}
                <div className={styles.progressSection}>
                  <div className={styles.progressLabel}>
                    <span className={styles.progressLabel} style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                      {s.hasChildren ? '子项目综合进度' : '完成进度'}
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

                {/* 服务期时间线 */}
                {svcProgress !== null && (
                  <div className={`${styles.serviceTimeline} ${svcExpired ? styles.serviceTimelineExpired : ''}`}>
                    <span className={styles.serviceTimelineLabel}>服务期</span>
                    <div className={styles.serviceTimelineBar}>
                      <div
                        className={styles.serviceTimelineFill}
                        style={{
                          width: `${svcProgress}%`,
                          background: svcExpired ? '#ff6b6b' : s.project.color,
                        }}
                      />
                    </div>
                    <span className={styles.serviceTimelineDate}>
                      {(() => {
                        const fmt = (str: string) => {
                          const d = new Date(str + 'T00:00:00');
                          return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                        };
                        return `${fmt(s.project.serviceStart!)} — ${fmt(s.project.serviceEnd!)}`;
                      })()}
                    </span>
                  </div>
                )}

                {/* 最近里程碑 */}
                {s.nearestMilestone && (
                  <div className={styles.milestoneSection}>
                    <div className={styles.sectionHeader}>最近里程碑</div>
                    <div className={styles.milestoneRow}>
                      <span className={styles.milestoneIcon}><Icon name="diamond" size={10} /></span>
                      <span className={styles.milestoneText}>{s.nearestMilestone.name}</span>
                      <span className={styles.milestoneDate}>目标 {fmtDate(s.nearestMilestone.targetDate)}</span>
                    </div>
                  </div>
                )}

                {/* 近15天任务 */}
                {s.upcomingTasks.length > 0 && (
                  <div className={styles.taskSection}>
                    <div className={styles.sectionHeader}>近15天任务 ({s.upcomingTasks.length}项)</div>
                    {s.upcomingTasks.map((t, j) => (
                      <div key={j} className={styles.taskItem}>
                        <span className={styles.taskBullet}>&middot;</span>
                        <span className={styles.taskText}>{t.title}</span>
                        <span className={styles.taskDate}>截止 {fmtDate(t.deadline)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 底部统计 */}
                <div className={styles.projectStats}>
                  <div className={styles.projectStatItem}>
                    周报 <span className={styles.projectStatValue}>{s.reportCount}</span>期
                  </div>
                  <div className={styles.projectStatItem}>
                    风险 <span
                      className={styles.projectStatValue}
                      style={{ color: s.allRiskCount > 0 ? '#ff6b6b' : undefined }}
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

      {/* 高风险快照（仅展示高等级未处理风险） */}
      {highRisks.length > 0 && (
        <section className={styles.riskSection}>
          <div className={styles.riskHeader}>
            <h2 className={styles.riskTitle}><Icon name="zap" size={16} color="#ffb347" /> 高风险项</h2>
            <span className={styles.riskCount}>共 {highRisks.length} 项</span>
          </div>
          <div className={styles.riskList}>
            {highRisks.map((risk, i) => {
              const { r, g, b } = hexToRgb(risk.projectColor);
              const weekDate = risk.weekStart
                ? (() => {
                    const d = new Date(risk.weekStart + 'T00:00:00');
                    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                  })()
                : '';
              const savingKey = `${risk.projectId}::${risk.description}`;
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
                      <div className={styles.riskSuggestion}><Icon name="lightbulb" size={13} color="#ffb347" /> {risk.suggestion}</div>
                    )}
                    <div className={styles.riskMeta}>
                      <span className={styles.riskProjectTag}
                        style={{ background: `rgba(${r},${g},${b},0.08)`, color: risk.projectColor }}
                      >
                        {risk.projectName}
                      </span>
                      <span className={styles.riskWeekTag}>{risk.weekLabel}{weekDate ? ` · ${weekDate}` : ''}</span>
                      {canEdit ? (
                        <select
                          className={styles.statusSelect}
                          value={risk.status}
                          disabled={savingRiskKey === savingKey}
                          onChange={(e) => handleRiskStatusChange(risk.projectId, risk.description, e.target.value)}
                        >
                          <option value="待处理">待处理</option>
                          <option value="持续关注">持续关注</option>
                          <option value="已解决">已解决</option>
                        </select>
                      ) : (
                        <span className={styles.riskStatusTag}>
                          {risk.status === '待处理' ? <><Icon name="clock" size={12} color="#ff6b6b" /> 待处理</> : risk.status === '持续关注' ? <><Icon name="eye" size={12} color="#ffb347" /> 持续关注</> : risk.status}
                        </span>
                      )}
                      {savingRiskKey === savingKey && <span className={styles.savingHint}>保存中…</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 下钻弹窗 */}
      {drillDown && (
        <div className={styles.drillOverlay} onClick={() => setDrillDown(null)}>
          <div className={styles.drillPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.drillHeader}>
              <h3 className={styles.drillTitle}>
                {drillDown === 'risks' ? '当前累计风险详情' : '剩余计划详情'}
              </h3>
              <button className={styles.drillClose} onClick={() => setDrillDown(null)}>×</button>
            </div>
            {drillDown === 'risks' ? (
              kpiData.cumulativeRiskDetails.length === 0 ? (
                <div className={styles.drillEmpty}>暂无未处理的风险</div>
              ) : (
                kpiData.cumulativeRiskDetails.map((risk, i) => {
                  const { r, g, b } = hexToRgb(risk.projectColor);
                  const weekDate = risk.weekStart
                    ? (() => {
                        const d = new Date(risk.weekStart + 'T00:00:00');
                        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                      })()
                    : '';
                  const savingKey = `${risk.projectId}::${risk.description}`;
                  return (
                    <div key={i} className={styles.drillRiskItem}>
                      <span className={`${styles.riskLevelBadge} ${RISK_LEVEL_CLASS[risk.level] || styles.riskLevelLow}`}>
                        {risk.level}
                      </span>
                      <div className={styles.drillRiskBody}>
                        <div className={styles.drillRiskDesc}>{risk.description}</div>
                        <div className={styles.drillRiskMeta}>
                          <span style={{ background: `rgba(${r},${g},${b},0.08)`, color: risk.projectColor, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                            {risk.projectName}
                          </span>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{risk.weekLabel}{weekDate ? ` · ${weekDate}` : ''}</span>
                          {canEdit ? (
                            <select
                              className={styles.statusSelect}
                              value={risk.status}
                              disabled={savingRiskKey === savingKey}
                              onChange={(e) => handleRiskStatusChange(risk.projectId, risk.description, e.target.value)}
                            >
                              <option value="待处理">待处理</option>
                              <option value="持续关注">持续关注</option>
                              <option value="已解决">已解决</option>
                            </select>
                          ) : (
                            <span style={{ color: risk.status === '待处理' ? '#ff6b6b' : '#9aaec9', fontSize: 12 }}>
                              {risk.status === '待处理' ? '待处理' : '持续关注'}
                            </span>
                          )}
                          {savingRiskKey === savingKey && <span className={styles.savingHint}>保存中…</span>}
                        </div>
                        {risk.suggestion && (
                          <div className={styles.drillRiskSuggestion}>💡 {risk.suggestion}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              kpiData.planDetails.length === 0 ? (
                <div className={styles.drillEmpty}>暂无剩余计划</div>
              ) : (
                kpiData.planDetails.map((plan, i) => {
                  const { r, g, b } = hexToRgb(plan.projectColor);
                  const weekDate = plan.weekStart
                    ? (() => {
                        const d = new Date(plan.weekStart + 'T00:00:00');
                        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
                      })()
                    : '';
                  return (
                    <div key={i} className={styles.drillRiskItem}>
                      <span className={styles.drillPlanNum}>{i + 1}</span>
                      <div className={styles.drillRiskBody}>
                        <div className={styles.drillRiskDesc}>{plan.title}</div>
                        <div className={styles.drillRiskMeta}>
                          <span style={{ background: `rgba(${r},${g},${b},0.08)`, color: plan.projectColor, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                            {plan.projectName}
                          </span>
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{plan.weekLabel}{weekDate ? ` · ${weekDate}` : ''}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>
      )}

      {/* 导出项目选择弹窗 */}
      {showExportModal && (
        <ProjectExportModal
          projects={projects}
          allReports={allReports}
          onCancel={() => setShowExportModal(false)}
          onConfirm={(selectedIds) => {
            const selectedProjects = projects.filter(p => selectedIds.includes(p.id));
            setShowExportModal(false);
            exportWeeklySummaryPDF(selectedProjects, allReports);
          }}
        />
      )}

      {/* 底部时间戳：最新一份周报的更新时间 */}
      <footer className={styles.footer}>
        {(() => {
          if (allReports.length === 0) return '暂无周报数据';
          const latest = getLatestReport(allReports)!;
          if (!latest.updatedAt) return '暂无更新时间';
          const d = new Date(latest.updatedAt);
          const pad = (n: number) => String(n).padStart(2, '0');
          return `数据更新于 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        })()}
      </footer>
    </div>
  );
}
