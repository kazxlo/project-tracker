import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, getProjects, getReports, getAllReports, deleteProject, deleteReport, saveProject, updateRiskStatus, getMilestones, getProjectTasks } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { Project, WeeklyReport, Risk, Milestone, ProjectTask } from '../types';
import ChildProjectCard from '../components/ChildProjectCard';
import ProjectDashboard from '../components/ProjectDashboard';
import ProjectPlanEditor from '../components/ProjectPlanEditor';
import shared from '../styles/shared.module.css';

const STATUS_CLASS: Record<string, string> = {
  '正常推进': shared.tagNormal,
  '需关注': shared.tagWarning,
  '存在风险': shared.tagDanger,
};

type TabKey = 'dashboard' | 'children' | 'reports' | 'summary';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const isMember = role === 'member';
  const isPublic = role === 'public';
  const canEdit = isAdmin || isMember;
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'trend' | 'client' | TabKey>('list');
  const [confirmDeleteReport, setConfirmDeleteReport] = useState<string | null>(null);
  const [confirmDeleteChild, setConfirmDeleteChild] = useState<string | null>(null);

  // 里程碑 + 项目任务
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);

  // 计划编辑器弹窗
  const [planEditorOpen, setPlanEditorOpen] = useState(false);

  // 子项目编辑弹窗（表单数据合并到一个状态，避免 setState 分离导致闪退）
  const [childModal, setChildModal] = useState<{
    open: boolean;
    editing: Project | null;
    form: Project;
  }>({ open: false, editing: null, form: emptyChildProject() });
  const [childSaving, setChildSaving] = useState(false);

  // 风险下钻弹窗
  const [riskDrillDown, setRiskDrillDown] = useState<'active' | 'resolved' | null>(null);
  const [savingRiskKey, setSavingRiskKey] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // 子项目数据
  const childProjects = allProjects.filter(p => p.parentId === id);
  const hasChildren = childProjects.length > 0;
  const isChild = project?.parentId != null;
  const parentProject = isChild ? allProjects.find(p => p.id === project?.parentId) : null;

  const loadData = async () => {
    if (!id) return;
    try {
      const [p, projs, reps, allReps, ms, ts] = await Promise.all([
        getProject(id),
        getProjects(),
        getReports(id),
        getReportsWithChildren(id),
        getMilestones(id),
        getProjectTasks(id),
      ]);
      setProject(p || null);
      setAllProjects(projs);
      setReports(reps);
      setAllReports(allReps);
      setMilestones(ms);
      setProjectTasks(ts);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      await loadData();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, navigate]);

  // 为有子项目的父项目加载所有子项目的周报
  async function getReportsWithChildren(projectId: string): Promise<WeeklyReport[]> {
    try {
      return await getAllReports();
    } catch {
      return [];
    }
  }

  // 全局点击清除确认删除状态
  useEffect(() => {
    if (confirmDeleteReport === null && confirmDeleteChild === null) return;
    const handler = (e: MouseEvent) => {
      if (confirmDeleteReport !== null && !(e.target as HTMLElement).closest(`[data-delete-report="${confirmDeleteReport}"]`)) {
        setConfirmDeleteReport(null);
      }
      if (confirmDeleteChild !== null && !(e.target as HTMLElement).closest(`[data-delete-id="child-${confirmDeleteChild}"]`)) {
        setConfirmDeleteChild(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [confirmDeleteReport, confirmDeleteChild]);

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId);
      setConfirmDeleteReport(null);
      await loadData();
      showToast('周报已删除', 'success');
    } catch (err) {
      console.error('删除周报失败:', err);
    }
  };

  const handleDeleteChild = async (childId: string) => {
    try {
      // 级联删除子项目及其周报
      const childReports = allReports.filter(r => r.projectId === childId);
      for (const r of childReports) {
        await deleteReport(r.id);
      }
      const child = allProjects.find(p => p.id === childId);
      if (child) {
        await saveProject({ ...child, parentId: undefined });
      }
      setConfirmDeleteChild(null);
      await loadData();
      showToast('子项目已移除', 'success');
    } catch (err) {
      console.error('删除子项目失败:', err);
      showToast('删除失败', 'error');
    }
  };

  const handleRiskStatusChange = async (description: string, newStatus: string) => {
    if (!id) return;
    setSavingRiskKey(description);
    try {
      await updateRiskStatus(id, description, newStatus as '待处理' | '已解决' | '持续关注');
      await loadData();
    } catch (err) {
      console.error('更新风险状态失败:', err);
    } finally {
      setSavingRiskKey(null);
    }
  };

  // ===== 子项目编辑弹窗 =====
  const openChildCreateModal = () => {
    setChildModal({ open: true, editing: null, form: { ...emptyChildProject(), parentId: id } });
  };
  const openChildEditModal = (p: Project) => {
    setChildModal({ open: true, editing: p, form: { ...p } });
  };
  const handleSaveChild = async () => {
    if (!childModal.form.name.trim()) return;
    setChildSaving(true);
    try {
      const finalChild = childModal.form.id
        ? childModal.form
        : { ...childModal.form, id: 'p_' + Date.now() };
      await saveProject(finalChild);
      setChildModal({ open: false, editing: null, form: emptyChildProject() });
      await loadData();
      showToast(childModal.form.id ? '子项目已保存' : '子项目已创建', 'success');
    } catch (err) {
      console.error('保存子项目失败:', err);
      showToast('保存失败', 'error');
    } finally {
      setChildSaving(false);
    }
  };

  // 确定默认tab：顶层项目默认切到「项目仪表盘」
  useEffect(() => {
    if (!loading && !isChild && tab === 'list') {
      setTab('dashboard');
    }
  }, [loading, isChild]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#6b7a93' }}>
        加载中...
      </div>
    );
  }

  if (!project) return null;

  const statusCls = STATUS_CLASS[project.status] || shared.tagNormal;
  const latestReport = reports.length > 0
    ? reports.reduce((a, b) => a.weekStart > b.weekStart ? a : b)
    : null;

  // 子项目统计
  const getChildStats = (childId: string) => {
    const crpts = allReports.filter(r => r.projectId === childId);
    const clatest = crpts.length > 0 ? crpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b) : null;
    const riskSeen = new Set<string>();
    crpts.forEach(r => r.risks.forEach(rk => {
      if (rk.status !== '已解决') {
        const key = rk.description.trim();
        if (key) riskSeen.add(key);
      }
    }));
    return {
      reportCount: crpts.length,
      progress: clatest?.progress || 0,
      riskCount: riskSeen.size,
    };
  };

  // ====== 父项目布局（顶层项目始终显示此布局） ======
  if (!isChild) {
    return (
      <div>
        {toast && (
          <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
            {toast.msg}
          </div>
        )}

        {/* 返回链接 */}
        <span className={shared.backLink} onClick={() => navigate('/')}>
          ← 返回驾驶舱
        </span>

        {/* 项目头 */}
        <div className={shared.projectHeader}>
          <div className={shared.projectInfo}>
            <h2 className={shared.projectTitle}>{project.name}</h2>
            <span className={shared.textMuted}>
              负责人: {project.owner} · 子项目 {childProjects.length} 个
              {project.startDate && ` · 启动: ${project.startDate}`}
            </span>
          </div>
          <span className={`${shared.badge} ${statusCls}`} style={{ padding: '4px 14px' }}>{project.status}</span>
        </div>

        {/* KPI 行 */}
        <div className={shared.kpiRow}>
          {[
            { label: '子项目数', val: childProjects.length, color: project.color },
            { label: '综合进度', val: childProjects.length > 0 ? `${Math.round(childProjects.reduce((s, c) => s + getChildStats(c.id).progress, 0) / childProjects.length)}%` : (() => { const prLatest = reports.length > 0 ? reports.reduce((a, b) => a.weekStart > b.weekStart ? a : b) : null; return prLatest ? `${prLatest.progress}%` : '--'; })(), color: project.color },
            { label: '累计周报', val: childProjects.reduce((s, c) => s + getChildStats(c.id).reportCount, 0) + reports.length },
            { label: '当前风险', val: (() => {
              const rs = new Set<string>();
              childProjects.forEach(c => {
                allReports.filter(r => r.projectId === c.id).forEach(r => r.risks.forEach(rk => {
                  if (rk.status !== '已解决') { const k = rk.description.trim(); if (k) rs.add(k); }
                }));
              });
              allReports.filter(r => r.projectId === project.id).forEach(r => r.risks.forEach(rk => {
                if (rk.status !== '已解决') { const k = rk.description.trim(); if (k) rs.add(k); }
              }));
              return rs.size;
            })(), clickable: true, drill: 'active' as const },
            { label: '已处理风险', val: (() => {
              const rs = new Set<string>();
              [...childProjects, project].forEach(p => {
                allReports.filter(r => r.projectId === p.id).forEach(r => r.risks.forEach(rk => {
                  if (rk.status === '已解决') { const k = rk.description.trim(); if (k) rs.add(k); }
                }));
              });
              return rs.size;
            })(), clickable: true, drill: 'resolved' as const },
          ].map((m, i) => (
            <div key={i} className={shared.kpiBox} style={m.clickable ? { cursor: 'pointer' } : undefined} onClick={() => { if (m.drill) setRiskDrillDown(m.drill); }}>
              <div className={shared.kpiVal} style={'color' in m ? { color: (m as { color?: string }).color } : undefined}>{m.val}</div>
              <div className={shared.kpiLbl}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className={shared.tabBar}>
          {[
            { key: 'dashboard' as TabKey, label: '项目仪表盘' },
            { key: 'children' as TabKey, label: '子项目概览' },
            { key: 'reports' as TabKey, label: '周报列表' },
            { key: 'summary' as TabKey, label: '汇总视图' },
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

        {/* Tab: 项目仪表盘 */}
        {tab === 'dashboard' && (
          <ProjectDashboard
            project={project}
            reports={reports}
            childProjects={childProjects}
            allReports={allReports}
            milestones={milestones}
            tasks={projectTasks}
            onOpenPlanEditor={() => setPlanEditorOpen(true)}
            getChildStats={getChildStats}
          />
        )}

        {/* Tab: 子项目概览 */}
        {tab === 'children' && (
          <>
            {isAdmin && (
              <div className={shared.childToolbar}>
                <button type="button" className={shared.btnPrimary} onClick={openChildCreateModal}>
                  + 添加子项目
                </button>
              </div>
            )}
            {childProjects.length === 0 ? (
              <div className={shared.emptyState}>暂无子项目，点击上方按钮添加</div>
            ) : (
              <div className={shared.childGrid}>
                {childProjects.map(c => (
                  <ChildProjectCard
                    key={c.id}
                    project={c}
                    stats={getChildStats(c.id)}
                    onEdit={openChildEditModal}
                    onDelete={handleDeleteChild}
                    confirmDelete={confirmDeleteChild}
                    setConfirmDelete={setConfirmDeleteChild}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab: 周报列表 */}
        {tab === 'reports' && (
          <>
            {!isPublic && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button className={shared.btnPrimary} onClick={() => navigate(`/project/${id}/report/new`)}>
                  + 新建周报
                </button>
              </div>
            )}
            <div className={shared.reportList}>
              {reports.length === 0 && (
                <div className={shared.emptyState}>暂无周报，点击上方按钮创建</div>
              )}
              {reports.map(r => {
                const updatedTime = r.updatedAt
                  ? (() => {
                      const d = new Date(r.updatedAt);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    })()
                  : null;
                return (
                  <div key={r.id} className={shared.reportRow}>
                    <div>
                      <div className={shared.reportRowTitle}>
                        {r.weekLabel} ({r.weekStart} - {r.weekEnd})
                      </div>
                      <div className={shared.reportRowStats}>
                        完成{r.completedItems.length}项 · 计划{r.plannedItems.length}项 · 风险{r.risks.length}项
                        {updatedTime && (
                          <span style={{ marginLeft: 12, fontSize: 11, color: '#9aaec9' }}>最后修改 {updatedTime}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={shared.linkText} onClick={() => navigate(`/project/${id}/report/${r.id}`)}>
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
                );
              })}
            </div>
          </>
        )}

        {/* Tab: 汇总视图 */}
        {tab === 'summary' && (
          <SummaryView
            project={project}
            reports={reports}
            childProjects={childProjects}
            allReports={allReports}
            getChildStats={getChildStats}
            canEdit={canEdit}
            savingRiskKey={savingRiskKey}
            handleRiskStatusChange={handleRiskStatusChange}
          />
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
                const seen = new Map<string, { risk: Risk; weekLabel: string; projectName: string }>();
                const targets = [...childProjects, project];
                targets.forEach(p => {
                  allReports.filter(r => r.projectId === p.id).forEach(r => {
                    r.risks.forEach(rk => {
                      const k = rk.description.trim();
                      if (!k || seen.has(k)) return;
                      const isActive = rk.status !== '已解决';
                      if ((riskDrillDown === 'active' && isActive) || (riskDrillDown === 'resolved' && !isActive)) {
                        seen.set(k, { risk: rk, weekLabel: r.weekLabel, projectName: p.name });
                      }
                    });
                  });
                });
                const items = Array.from(seen.values());
                if (items.length === 0) {
                  return <div className={shared.drillItem} style={{ color: '#6b7a93', textAlign: 'center', padding: 24 }}>暂无数据</div>;
                }
                return items.map((item, j) => (
                  <div key={j} className={shared.drillItem} style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: item.risk.level === '高' ? '#FCEBEB' : item.risk.level === '中' ? '#FAEEDA' : '#EAF3DE', color: item.risk.level === '高' ? '#A32D2D' : item.risk.level === '中' ? '#854F0B' : '#2d8a4e' }}>{item.risk.level}</span>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{item.risk.description}</span>
                      <span className={shared.badge} style={{ fontSize: 10, padding: '1px 6px', background: '#f0f2f7', color: '#6b7a93' }}>{item.projectName}</span>
                      {canEdit ? (
                        <select
                          className={shared.statusSelectSm}
                          value={item.risk.status}
                          disabled={savingRiskKey === item.risk.description}
                          onChange={(e) => handleRiskStatusChange(item.risk.description, e.target.value)}
                        >
                          <option value="待处理">⏳ 待处理</option>
                          <option value="持续关注">👁 持续关注</option>
                          <option value="已解决">✓ 已解决</option>
                        </select>
                      ) : (
                        <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: '#f0f2f7', color: '#6b7a93' }}>{item.risk.status}</span>
                      )}
                    </div>
                    {item.risk.suggestion && (
                      <div style={{ fontSize: 12, color: '#6b7a93', paddingLeft: 48 }}>💡 建议：{item.risk.suggestion}</div>
                    )}
                    {riskDrillDown === 'resolved' && item.risk.resolvedAt && (
                      <div style={{ fontSize: 12, color: '#4ADE80', paddingLeft: 48 }}>✓ 处理时间：{new Date(item.risk.resolvedAt).toLocaleDateString('zh-CN')}</div>
                    )}
                    <div style={{ fontSize: 11, color: '#6b7a93', paddingLeft: 48 }}>来源：{item.projectName} · {item.weekLabel}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* 子项目编辑弹窗 */}
        {childModal.open && (
          <div className={shared.modalOverlay} onClick={() => setChildModal(prev => ({ ...prev, open: false }))}>
            <div className={shared.modal} onClick={e => e.stopPropagation()}>
              <div className={shared.modalHeader}>
                <h3 className={shared.modalTitle}>{childModal.form.id ? '编辑子项目' : '添加子项目'}</h3>
                <button type="button" className={shared.modalClose} onClick={() => setChildModal(prev => ({ ...prev, open: false }))}>×</button>
              </div>
              <div className={shared.modalBody}>
                <div>
                  <label className={shared.formLabel}>项目名称</label>
                  <input
                    className={shared.formInput}
                    value={childModal.form.name}
                    onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, name: e.target.value } }))}
                    placeholder="输入项目名称"
                    autoFocus
                  />
                </div>
                <div>
                  <label className={shared.formLabel}>服务内容</label>
                  <textarea
                    className={shared.formTextarea}
                    rows={2}
                    value={childModal.form.description || ''}
                    onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, description: e.target.value } }))}
                    placeholder="简述服务内容（可选）"
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>负责人</label>
                    <input
                      className={shared.formInput}
                      value={childModal.form.owner}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, owner: e.target.value } }))}
                      placeholder="负责人姓名"
                    />
                  </div>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>启动日期</label>
                    <input
                      className={shared.formInput}
                      type="date"
                      value={childModal.form.startDate}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, startDate: e.target.value } }))}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>预估截止时间</label>
                    <input
                      className={shared.formInput}
                      type="date"
                      value={childModal.form.deadline || ''}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, deadline: e.target.value } }))}
                    />
                  </div>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>状态</label>
                    <select
                      className={shared.formSelect}
                      style={{ width: '100%', padding: '8px 12px' }}
                      value={childModal.form.status}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, status: e.target.value as Project['status'] } }))}
                    >
                      <option value="正常推进">正常推进</option>
                      <option value="需关注">需关注</option>
                      <option value="存在风险">存在风险</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>服务期开始</label>
                    <input
                      className={shared.formInput}
                      type="date"
                      value={childModal.form.serviceStart || ''}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, serviceStart: e.target.value } }))}
                    />
                  </div>
                  <div className={shared.formGroup}>
                    <label className={shared.formLabel}>服务期结束</label>
                    <input
                      className={shared.formInput}
                      type="date"
                      value={childModal.form.serviceEnd || ''}
                      onChange={e => setChildModal(prev => ({ ...prev, form: { ...prev.form, serviceEnd: e.target.value } }))}
                    />
                  </div>
                </div>
                <div>
                  <label className={shared.formLabel}>项目颜色</label>
                  <div className={shared.colorGrid}>
                    {['#5B9EF5', '#4ADE80', '#FB923C', '#A78BFA', '#2DD4BF', '#FBBF24', '#F472B6', '#60A5FA'].map(c => (
                      <div
                        key={c}
                        className={`${shared.colorSwatch} ${childModal.form.color === c ? shared.colorSwatchActive : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setChildModal(prev => ({ ...prev, form: { ...prev.form, color: c } }))}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className={shared.modalFooter}>
                <button type="button" className={shared.btnOutline} onClick={() => setChildModal(prev => ({ ...prev, open: false }))}>取消</button>
                <button
                  type="button"
                  className={shared.btnPrimaryLg}
                  onClick={handleSaveChild}
                  disabled={!childModal.form.name.trim() || childSaving}
                >
                  {childSaving ? '保存中...' : childModal.form.id ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 计划编辑器弹窗 */}
        {planEditorOpen && (
          <ProjectPlanEditor
            projectId={id!}
            open={planEditorOpen}
            onClose={async () => {
              setPlanEditorOpen(false);
              // 重新加载里程碑和任务
              try {
                const [ms, ts] = await Promise.all([getMilestones(id!), getProjectTasks(id!)]);
                setMilestones(ms);
                setProjectTasks(ts);
              } catch { /* ignore */ }
            }}
            toast={showToast}
          />
        )}
      </div>
    );
  }

  // ====== 普通项目布局（无子项目） ======
  return (
    <div>
      {toast && (
        <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
          {toast.msg}
        </div>
      )}

      {/* 返回链接 */}
      {isChild && parentProject ? (
        <span className={shared.parentBackLink} onClick={() => navigate(`/project/${parentProject.id}`)}>
          ← 返回 {parentProject.name}
        </span>
      ) : (
        <span className={shared.backLink} onClick={() => navigate('/')}>
          ← 返回驾驶舱
        </span>
      )}

      <div className={shared.projectHeader}>
        <div className={shared.projectInfo}>
          <h2 className={shared.projectTitle}>{project.name}</h2>
          <span className={shared.textMuted}>
            负责人: {project.owner} · 启动时间: {project.startDate}
          </span>
          {(project.serviceStart || project.serviceEnd) && (
            <div className={shared.textMuted} style={{ marginTop: 4 }}>
              服务期: {project.serviceStart || '?'} — {project.serviceEnd || '?'}
            </div>
          )}
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
          { key: 'dashboard' as const, label: '项目仪表盘' },
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

      {!isPublic && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            className={shared.btnPrimary}
            onClick={() => navigate(`/project/${id}/report/new`)}
          >
            + 新建周报
          </button>
        </div>
      )}

      {tab === 'dashboard' && (
        <ProjectDashboard
          project={project}
          reports={reports}
          childProjects={[]}
          allReports={allReports}
          milestones={milestones}
          tasks={projectTasks}
          onOpenPlanEditor={() => setPlanEditorOpen(true)}
          getChildStats={() => ({ reportCount: 0, progress: 0, riskCount: 0 })}
        />
      )}

      {tab === 'list' && (
        <div className={shared.reportList}>
          {reports.length === 0 && (
            <div className={shared.emptyState}>暂无周报，点击上方按钮创建</div>
          )}
          {reports.map(r => {
            const updatedTime = r.updatedAt
              ? (() => {
                  const d = new Date(r.updatedAt);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                })()
              : null;
            return (
            <div key={r.id} className={shared.reportRow}>
              <div>
                <div className={shared.reportRowTitle}>
                  {r.weekLabel} ({r.weekStart} - {r.weekEnd})
                </div>
                <div className={shared.reportRowStats}>
                  完成{r.completedItems.length}项 · 计划{r.plannedItems.length}项 · 风险{r.risks.length}项
                  {updatedTime && (
                    <span style={{ marginLeft: 12, fontSize: 11, color: '#9aaec9' }}>最后修改 {updatedTime}</span>
                  )}
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
            );
          })}
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
                    <div className={shared.barValue} style={{ color: '#4F8EF7' }}>{r.completedItems.length}</div>
                    <div
                      className={shared.barBody}
                      style={{
                        height: h,
                        background: '#4F8EF7',
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
                return <div className={shared.drillItem} style={{ color: '#6b7a93', textAlign: 'center', padding: 24 }}>暂无数据</div>;
              }
              return items.map((item, j) => (
                <div key={j} className={shared.drillItem} style={{ padding: '8px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: item.risk.level === '高' ? '#FCEBEB' : item.risk.level === '中' ? '#FAEEDA' : '#EAF3DE', color: item.risk.level === '高' ? '#A32D2D' : item.risk.level === '中' ? '#854F0B' : '#2d8a4e' }}>{item.risk.level}</span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{item.risk.description}</span>
                    {canEdit ? (
                      <select
                        className={shared.statusSelectSm}
                        value={item.risk.status}
                        disabled={savingRiskKey === item.risk.description}
                        onChange={(e) => handleRiskStatusChange(item.risk.description, e.target.value)}
                      >
                        <option value="待处理">⏳ 待处理</option>
                        <option value="持续关注">👁 持续关注</option>
                        <option value="已解决">✓ 已解决</option>
                      </select>
                    ) : (
                      <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: '#f0f2f7', color: '#6b7a93' }}>
                        {item.risk.status}
                      </span>
                    )}
                    {savingRiskKey === item.risk.description && (
                      <span style={{ fontSize: 11, color: '#6b7a93' }}>保存中…</span>
                    )}
                  </div>
                  {item.risk.suggestion && (
                    <div style={{ fontSize: 12, color: '#6b7a93', paddingLeft: 48 }}>💡 建议：{item.risk.suggestion}</div>
                  )}
                  {riskDrillDown === 'resolved' && item.risk.resolvedAt && (
                    <div style={{ fontSize: 12, color: '#4ADE80', paddingLeft: 48 }}>✓ 处理时间：{new Date(item.risk.resolvedAt).toLocaleDateString('zh-CN')}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#6b7a93', paddingLeft: 48 }}>来源：{item.weekLabel}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* 计划编辑器弹窗 */}
      {planEditorOpen && (
        <ProjectPlanEditor
          projectId={id!}
          open={planEditorOpen}
          onClose={async () => {
            setPlanEditorOpen(false);
            try {
              const [ms, ts] = await Promise.all([getMilestones(id!), getProjectTasks(id!)]);
              setMilestones(ms);
              setProjectTasks(ts);
            } catch { /* ignore */ }
          }}
          toast={showToast}
        />
      )}
    </div>
  );
}

/** 子项目表单初始值 */
function emptyChildProject(): Project {
  return {
    id: '', name: '', owner: '', startDate: '', deadline: '', deadlineExtensions: 0,
    status: '正常推进', color: '#5B9EF5', parentId: undefined,
    description: '', serviceStart: '', serviceEnd: '',
  };
}

/** 汇总视图面板 */
function SummaryView({
  project,
  reports,
  childProjects,
  allReports,
  getChildStats,
  canEdit,
  savingRiskKey,
  handleRiskStatusChange,
}: {
  project: Project;
  reports: WeeklyReport[];
  childProjects: Project[];
  allReports: WeeklyReport[];
  getChildStats: (id: string) => { reportCount: number; progress: number; riskCount: number };
  canEdit: boolean;
  savingRiskKey: string | null;
  handleRiskStatusChange: (desc: string, status: string) => void;
}) {
  const latest = reports.length > 0
    ? reports.reduce((a, b) => a.weekStart > b.weekStart ? a : b)
    : null;
  const hasChildren = childProjects.length > 0;

  return (
    <div>
      {/* 采购管理 建设目标 + 本周工作 */}
      <div className={shared.clientWrap} style={{ maxWidth: '100%' }}>
        <div className={shared.summaryViewHeader}>
          <h2 className={shared.summaryViewTitle}>{project.name} — 信息化工作周报</h2>
          {latest && (
            <p className={shared.summaryViewDate}>
              {latest.weekLabel}（{latest.weekStart} - {latest.weekEnd}）
            </p>
          )}
        </div>

        <div className={shared.summarySection}>
          <h3 className={shared.summarySectionTitle}>建设目标</h3>
          <p className={shared.summaryText}>{latest?.goals || '暂无'}</p>
        </div>

        <div className={shared.summarySection}>
          <h3 className={shared.summarySectionTitle}>重点内容</h3>
          <p className={shared.summaryText}>{latest?.highlights || '暂无'}</p>
        </div>

        {!hasChildren && (
        <div className={shared.summarySection}>
          <h3 className={shared.summarySectionTitle}>本周重点工作</h3>
          {latest?.completedItems.length === 0
            ? <p className={shared.summaryText} style={{ color: '#6b7a93' }}>暂无记录</p>
            : latest?.completedItems.map((item, i) => (
                <div key={item.id} className={`${shared.clientItem} ${i < (latest?.completedItems.length || 0) - 1 ? shared.clientItemBorder : ''}`}>
                  <span style={{ color: '#6b7a93', marginRight: 8 }}>{item.order}.</span>
                  <span style={{ fontWeight: 500 }}>{item.title}</span>
                </div>
              ))
          }
        </div>
        )}

        {!hasChildren && (
        <div className={shared.summarySection}>
          <h3 className={shared.summarySectionTitle}>下周工作计划</h3>
          {latest?.plannedItems.length === 0
            ? <p className={shared.summaryText} style={{ color: '#6b7a93' }}>暂无计划</p>
            : latest?.plannedItems.map((item, i) => (
                <div key={item.id} className={`${shared.clientItem} ${i < (latest?.plannedItems.length || 0) - 1 ? shared.clientItemBorder : ''}`}>
                  <span style={{ color: '#6b7a93', marginRight: 8 }}>{item.order}.</span>
                  {item.title}
                </div>
              ))
          }
        </div>
        )}

        {/* 各子项目最新状态 */}
        <div className={shared.summarySection}>
          <h3 className={shared.summarySectionTitle}>各子项目最新状态</h3>
          {childProjects.map(c => {
            const stats = getChildStats(c.id);
            const clatest = allReports
              .filter(r => r.projectId === c.id)
              .reduce<WeeklyReport | null>((a, b) => {
                if (!a) return b;
                return a.weekStart > b.weekStart ? a : b;
              }, null);
            return (
              <div key={c.id} className={shared.summarySubProject}>
                <div className={shared.summarySubProjectName}>
                  <span className={shared.summarySubProjectDot} style={{ background: c.color }} />
                  {c.name}
                  <span className={shared.badge} style={{ fontSize: 10, padding: '1px 6px', background: '#EAF3DE', color: '#2d8a4e' }}>
                    {c.status} · {stats.progress}%
                  </span>
                </div>
                <div className={shared.summarySubProjectMeta}>
                  负责人: {c.owner} · 周报 {stats.reportCount}期 · 风险 {stats.riskCount}项
                </div>
                {clatest && (
                  <div className={shared.summarySubProjectItems}>
                    {hasChildren ? (
                      <>
                        <div className={shared.summarySubProjectItem} style={{ color: '#6b7a93', fontWeight: 500, marginTop: 4 }}>
                          周报时间：{clatest.weekLabel}（{clatest.weekStart} - {clatest.weekEnd}）
                        </div>
                        {clatest.goals ? (
                          <>
                            <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>建设目标:</div>
                            <div className={shared.summarySubProjectItem} style={{ color: '#6b7a93' }}>{clatest.goals}</div>
                          </>
                        ) : null}
                        {clatest.highlights ? (
                          <>
                            <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>重点内容:</div>
                            <div className={shared.summarySubProjectItem} style={{ color: '#6b7a93' }}>{clatest.highlights}</div>
                          </>
                        ) : null}
                        {clatest.plannedItems.length > 0 && (
                          <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>下周工作计划:</div>
                        )}
                        {clatest.plannedItems.map(pi => (
                          <div key={pi.id} className={shared.summarySubProjectItem}>• {pi.title}</div>
                        ))}
                      </>
                    ) : (
                      <>
                        {clatest.completedItems.length > 0 && (
                          <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>本周完成:</div>
                        )}
                        {clatest.completedItems.slice(0, 3).map(ci => (
                          <div key={ci.id} className={shared.summarySubProjectItem}>• {ci.title}</div>
                        ))}
                        {clatest.plannedItems.length > 0 && (
                          <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>下周计划:</div>
                        )}
                        {clatest.plannedItems.slice(0, 3).map(pi => (
                          <div key={pi.id} className={shared.summarySubProjectItem}>• {pi.title}</div>
                        ))}
                        {clatest.risks.filter(rk => rk.status !== '已解决').length > 0 && (
                          <div className={shared.summarySubProjectItem} style={{ color: '#3d5a80', fontWeight: 500, marginTop: 4 }}>当前风险:</div>
                        )}
                        {clatest.risks.filter(rk => rk.status !== '已解决').slice(0, 3).map(rk => (
                          <div key={rk.id} className={shared.summarySubProjectItem} style={{ color: '#FB923C' }}>• [{rk.level}] {rk.description}</div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 综合风险提示 */}
        <div className={shared.summaryRiskSection}>
          <h3 className={shared.summarySectionTitle}>综合风险提示</h3>
          {(() => {
            const riskMap = new Map<string, { risk: import('../types').Risk; projectName: string }>();
            [...childProjects, project].forEach(p => {
              allReports.filter(r => r.projectId === p.id).forEach(r => {
                r.risks.forEach(rk => {
                  if (rk.status === '已解决') return;
                  const key = rk.description.trim();
                  if (key && !riskMap.has(key)) {
                    riskMap.set(key, { risk: rk, projectName: p.name });
                  }
                });
              });
            });
            const items = Array.from(riskMap.values()).sort((a, b) => {
              const order: Record<string, number> = { '高': 0, '中': 1, '低': 2 };
              return (order[a.risk.level] ?? 9) - (order[b.risk.level] ?? 9);
            });
            if (items.length === 0) {
              return <p className={shared.summaryText} style={{ color: '#6b7a93' }}>暂无风险</p>;
            }
            return items.map((item, i) => (
              <div key={i} className={shared.summaryRiskItem}>
                <span className={shared.summaryRiskLevel} style={{
                  background: item.risk.level === '高' ? '#FCEBEB' : item.risk.level === '中' ? '#FAEEDA' : '#EAF3DE',
                  color: item.risk.level === '高' ? '#A32D2D' : item.risk.level === '中' ? '#854F0B' : '#2d8a4e',
                }}>
                  {item.risk.level}
                </span>
                <span style={{ flex: 1 }}>
                  {item.risk.description}
                  {item.risk.suggestion ? ` — ${item.risk.suggestion}` : ''}
                </span>
                <span className={shared.badge} style={{ fontSize: 10, padding: '1px 6px', background: '#f0f2f7', color: '#6b7a93' }}>
                  {item.projectName}
                </span>
              </div>
            ));
          })()}
        </div>
      </div>
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
        <p className={shared.clientItem} style={{ lineHeight: 1.8, color: '#3d5a80' }}>
          {latest.goals || latest.summary || '暂无'}
        </p>
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>重点内容</h3>
        <p className={shared.clientItem} style={{ lineHeight: 1.8, color: '#3d5a80' }}>
          {latest.highlights || '暂无'}
        </p>
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>本周工作情况</h3>
        {latest.completedItems.length === 0
          ? <p className={shared.clientItem} style={{ color: '#6b7a93' }}>暂无记录</p>
          : latest.completedItems.map((item, i) => (
              <div
                key={item.id}
                className={`${shared.clientItem} ${i < latest.completedItems.length - 1 ? shared.clientItemBorder : ''}`}
              >
                <span style={{ color: '#6b7a93', marginRight: 8 }}>{item.order}.</span>
                <span style={{ fontWeight: 500 }}>{item.title}</span>
                {isP1 && item.progress && (
                  <div style={{ fontSize: 12, color: '#6b7a93', marginTop: 4, paddingLeft: 20 }}>
                    进展：{item.progress}
                  </div>
                )}
                {isP1 && item.acceptance && (
                  <div style={{ fontSize: 12, color: '#6b7a93', marginTop: 2, paddingLeft: 20 }}>
                    验收：{item.acceptance}
                  </div>
                )}
                {!isP1 && item.detail && (
                  <span style={{ color: '#6b7a93' }}> — {item.detail}</span>
                )}
              </div>
            ))
        }
      </div>

      <div className={shared.clientSection}>
        <h3 className={shared.clientH3}>下周工作计划</h3>
        {latest.plannedItems.length === 0
          ? <p className={shared.clientItem} style={{ color: '#6b7a93' }}>暂无计划</p>
          : latest.plannedItems.map((item, i) => (
              <div
                key={item.id}
                className={`${shared.clientItem} ${i < latest.plannedItems.length - 1 ? shared.clientItemBorder : ''}`}
              >
                <span style={{ color: '#6b7a93', marginRight: 8 }}>{item.order}.</span>
                {item.title}
              </div>
            ))
        }
      </div>

      <h3 className={shared.clientH3}>风险提示</h3>
      {latest.risks.length === 0
        ? <p className={shared.clientItem} style={{ color: '#6b7a93' }}>本周无风险项</p>
        : latest.risks.map((risk, i) => (
            <div
              key={risk.id}
              className={`${shared.clientItem} ${i < latest.risks.length - 1 ? shared.clientItemBorder : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: risk.level === '高' ? '#FCEBEB' : risk.level === '中' ? '#FAEEDA' : '#EAF3DE', color: risk.level === '高' ? '#A32D2D' : risk.level === '中' ? '#854F0B' : '#2d8a4e' }}>{risk.level}</span>
                <span style={{ color: '#6b7a93', fontSize: 12 }}>{risk.order}.</span>
                <span style={{ fontSize: 13 }}>{risk.description}</span>
                <span className={shared.badge} style={{ fontSize: 11, padding: '1px 8px', background: '#f0f2f7', color: '#6b7a93' }}>
                  {risk.status}
                </span>
              </div>
              {risk.suggestion && (
                <div style={{ fontSize: 12, color: '#6b7a93', paddingLeft: 60 }}>
                  💡 建议：{risk.suggestion}
                </div>
              )}
            </div>
          ))
      }
    </div>
  );
}
