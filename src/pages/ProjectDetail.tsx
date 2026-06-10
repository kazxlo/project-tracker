import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, getReports, deleteReport } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { Project, WeeklyReport, Risk } from '../types';
import shared from '../styles/shared.module.css';

const STATUS_CLASS: Record<string, string> = {
  '正常推进': shared.tagNormal,
  '需关注': shared.tagWarning,
  '存在风险': shared.tagDanger,
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'trend' | 'client'>('list');
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<string | null>(null);

  // 风险下钻弹窗
  const [riskDrillDown, setRiskDrillDown] = useState<'active' | 'resolved' | null>(null);

  const loadReports = async () => {
    if (!id) return;
    try {
      const reps = await getReports(id);
      setReports(reps);
    } catch (err) {
      console.error('加载周报失败:', err);
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const p = await getProject(id!);
        if (!cancelled) {
          if (!p) { navigate('/'); return; }
          setProject(p);
          const reps = await getReports(id!);
          if (!cancelled) setReports(reps);
        }
      } catch (err) {
        console.error('加载项目失败:', err);
        if (!cancelled) navigate('/');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, navigate]);

  // 全局点击清除确认删除状态
  useEffect(() => {
    if (confirmDeleteReport === null) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(`[data-delete-report="${confirmDeleteReport}"]`)) return;
      setConfirmDeleteReport(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [confirmDeleteReport]);

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId);
      setConfirmDeleteReport(null);
      await loadReports();
    } catch (err) {
      console.error('删除周报失败:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        加载中...
      </div>
    );
  }

  if (!project) return null;

  const statusCls = STATUS_CLASS[project.status] || shared.tagNormal;
  const latestReport = reports.length > 0
    ? reports.reduce((a, b) => a.weekStart > b.weekStart ? a : b)
    : null;

  return (
    <div>
      <span className={shared.backLink} onClick={() => navigate('/')}>
        ← 返回项目总览
      </span>

      <div className={shared.projectHeader}>
        <div className={shared.projectInfo}>
          <h2 className={shared.projectTitle}>{project.name}</h2>
          <span className={shared.textMuted}>
            负责人: {project.owner} · 启动时间: {project.startDate}
          </span>
        </div>
        <span className={`${shared.badge} ${statusCls}`} style={{ padding: '4px 14px' }}>{project.status}</span>
      </div>

      <div className={shared.kpiRow}>
        {[
          { label: '当前进度', val: latestReport?.progress ? `${latestReport.progress}%` : '--', color: project.color },
          { label: '累计周报', val: reports.length },
          { label: '完成事项', val: reports.reduce((s, r) => s + r.completedItems.length, 0) },
          { label: '当前风险', val: (() => { const s = new Map<string, Risk>(); reports.forEach(r => r.risks.forEach(rk => { const k = rk.description.trim(); if (k && rk.status !== '已解决' && !s.has(k)) s.set(k, rk); })); return s.size; })(), clickable: true, drill: 'active' as const },
          { label: '已处理风险', val: (() => { const s = new Map<string, Risk>(); reports.forEach(r => r.risks.forEach(rk => { const k = rk.description.trim(); if (k && rk.status === '已解决' && !s.has(k)) s.set(k, rk); })); return s.size; })(), clickable: true, drill: 'resolved' as const },
        ].map((m, i) => (
          <div key={i} className={shared.kpiBox} style={m.clickable ? { cursor: 'pointer' } : undefined} onClick={() => { if (m.drill) setRiskDrillDown(m.drill); }}>
            <div className={shared.kpiVal} style={'color' in m ? { color: (m as { color?: string }).color } : undefined}>{m.val}</div>
            <div className={shared.kpiLbl}>{m.label}</div>
          </div>
        ))}
      </div>

      <div className={shared.tabBar}>
        {[
          { key: 'list' as const, label: '周报列表' },
          { key: 'trend' as const, label: '进度趋势' },
          { key: 'client' as const, label: '汇报视图' },
        ].map(t => (
          <span
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`${shared.tab} ${tab === t.key ? shared.tabActive : shared.tabInactive}`}
          >
            {t.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          className={shared.btnPrimary}
          onClick={() => navigate(`/project/${id}/report/new`)}
        >
          + 新建周报
        </button>
      </div>

      {tab === 'list' && (
        <div className={shared.reportList}>
          {reports.length === 0 && (
            <div className={shared.emptyState}>暂无周报，点击上方按钮创建</div>
          )}
          {reports.map(r => (
            <div key={r.id} className={shared.reportRow}>
              <div>
                <div className={shared.reportRowTitle}>
                  {r.weekLabel} ({r.weekStart} - {r.weekEnd})
                </div>
                <div className={shared.reportRowStats}>
                  完成{r.completedItems.length}项 · 计划{r.plannedItems.length}项 · 风险{r.risks.length}项
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={shared.linkText}
                  onClick={() => navigate(`/project/${id}/report/${r.id}`)}
                >
                  查看详情 ↗
                </span>
                {isAdmin && (
                  <button
                    data-delete-report={r.id}
                    className={`${shared.actionBtn} ${shared.actionBtnDanger}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmDeleteReport === r.id) {
                        handleDeleteReport(r.id);
                      } else {
                        setConfirmDeleteReport(r.id);
                      }
                    }}
                  >
                    {confirmDeleteReport === r.id ? '确认删除？' : '删除'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'trend' && (
        <div className={shared.section}>
          <h3 className={shared.sectionTitle}>周度完成事项趋势</h3>
          {reports.length === 0 ? (
            <div className={shared.emptyState}>暂无数据</div>
          ) : (
            <div className={shared.barChartArea}>
              {reports.map((r, i) => {
                const h = Math.max(8, r.completedItems.length * 30);
                return (
                  <div key={r.id} className={shared.barCol}>
                    <div className={shared.barValue} style={{ color: '#378ADD' }}>{r.completedItems.length}</div>
                    <div
                      className={shared.barBody}
                      style={{
                        height: h,
                        background: '#378ADD',
                        opacity: 0.4 + (i / reports.length) * 0.6,
                      }}
                    />
                    <div className={shared.barLabel}>{r.weekLabel}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'client' && (
        <ClientViewPanel project={project} reports={reports} />
      )}

      {/* 风险下钻弹窗 */}
      {riskDrillDown && (
        <div className={shared.drillOverlay} onClick={() => setRiskDrillDown(null)}>
          <div className={shared.drillPanel} onClick={e => e.stopPropagation()}>
            <div className={shared.drillHeader}>
              <h3 className={shared.drillTitle}>
                {riskDrillDown === 'active' ? '当前风险详情' : '已处理风险详情'}
              </h3>
              <button className={shared.drillClose} onClick={() => setRiskDrillDown(null)}>×</button>
            </div>
            {(() => {
              const seen = new Map<string, { risk: Risk; weekLabel: string }>();
              reports.forEach(r => {
                r.risks.forEach(rk => {
                  const k = rk.description.trim();
                  if (!k || seen.has(k)) return;
                  const isActive = rk.status !== '已解决';
                  if ((riskDrillDown === 'active' && isActive) || (riskDrillDown === 'resolved' && !isActive)) {
                    seen.set(k, { risk: rk, weekLabel: r.weekLabel });
                  }
                });
              });
              const items = Array.from(seen.values());
              if (items.length === 0) {
                return <div className={shared.drillItem} style={{ color: '#999', textAlign: 'center', padding: 24 }}>暂无数据</div>;
              }
              return items.map((item, j) => (
                <div key={j} className={shared.drillItem} style={{ padding: '8px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: item.risk.level === '高' ? '#FCEBEB' : item.risk.level === '中' ? '#FAEEDA' : '#EAF3DE', color: item.risk.level === '高' ? '#A32D2D' : item.risk.level === '中' ? '#854F0B' : '#3B6D11' }}>{item.risk.level}</span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{item.risk.description}</span>
                  </div>
                  {item.risk.suggestion && (
                    <div style={{ fontSize: 12, color: '#666', paddingLeft: 48 }}>💡 建议：{item.risk.suggestion}</div>
                  )}
                  {riskDrillDown === 'resolved' && item.risk.resolvedAt && (
                    <div style={{ fontSize: 12, color: '#639922', paddingLeft: 48 }}>✓ 处理时间：{new Date(item.risk.resolvedAt).toLocaleDateString('zh-CN')}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#999', paddingLeft: 48 }}>来源：{item.weekLabel}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientViewPanel({ project, reports }: { project: Project; reports: WeeklyReport[] }) {
  if (reports.length === 0) {
    return (
      <div className={shared.section}>
        <div className={shared.emptyState}>暂无周报数据</div>
      </div>
    );
  }

  const latest = reports[0];
  const isP1 = project.id === 'p1';

  return (
    <div className={shared.clientWrap}>
      <h2 className={shared.clientTitle}>
        {project.name} - 信息化工作周报
      </h2>
      <p className={shared.clientDate}>
        {latest.weekLabel}（{latest.weekStart} - {latest.weekEnd}）
      </p>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>建设目标</h3>
        <p className={shared.clientItem} style={{ lineHeight: 1.8, color: '#555' }}>
          {latest.goals || latest.summary || '暂无'}
        </p>
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>重点内容</h3>
        <p className={shared.clientItem} style={{ lineHeight: 1.8, color: '#555' }}>
          {latest.highlights || '暂无'}
        </p>
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>本周工作情况</h3>
        {latest.completedItems.length === 0
          ? <p className={shared.clientItem} style={{ color: '#999' }}>暂无记录</p>
          : latest.completedItems.map((item, i) => (
              <div
                key={item.id}
                className={`${shared.clientItem} ${i < latest.completedItems.length - 1 ? shared.clientItemBorder : ''}`}
              >
                <span style={{ color: '#999', marginRight: 8 }}>{item.order}.</span>
                <span style={{ fontWeight: 500 }}>{item.title}</span>
                {isP1 && item.progress && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4, paddingLeft: 20 }}>
                    进展：{item.progress}
                  </div>
                )}
                {isP1 && item.acceptance && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2, paddingLeft: 20 }}>
                    验收：{item.acceptance}
                  </div>
                )}
                {!isP1 && item.detail && (
                  <span style={{ color: '#999' }}> — {item.detail}</span>
                )}
              </div>
            ))
        }
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>下周工作计划</h3>
        {latest.plannedItems.length === 0
          ? <p className={shared.clientItem} style={{ color: '#999' }}>暂无计划</p>
          : latest.plannedItems.map((item, i) => (
              <div
                key={item.id}
                className={`${shared.clientItem} ${i < latest.plannedItems.length - 1 ? shared.clientItemBorder : ''}`}
              >
                <span style={{ color: '#999', marginRight: 8 }}>{item.order}.</span>
                {item.title}
              </div>
            ))
        }
      </div>

      <h3 className={shared.clientH3}>风险提示</h3>
      {latest.risks.length === 0
        ? <p className={shared.clientItem} style={{ color: '#999' }}>本周无风险项</p>
        : latest.risks.map((risk, i) => (
            <div
              key={risk.id}
              className={`${shared.clientItem} ${i < latest.risks.length - 1 ? shared.clientItemBorder : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: risk.level === '高' ? '#FCEBEB' : risk.level === '中' ? '#FAEEDA' : '#EAF3DE', color: risk.level === '高' ? '#A32D2D' : risk.level === '中' ? '#854F0B' : '#3B6D11' }}>{risk.level}</span>
                <span style={{ color: '#999', fontSize: 12 }}>{risk.order}.</span>
                <span style={{ fontSize: 13 }}>{risk.description}</span>
                <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: '#f0f0f0', color: '#666' }}>
                  {risk.status}
                </span>
              </div>
              {risk.suggestion && (
                <div style={{ fontSize: 12, color: '#999', paddingLeft: 60 }}>
                  💡 建议：{risk.suggestion}
                </div>
              )}
            </div>
          ))
      }
    </div>
  );
}
