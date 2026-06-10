import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getAllReports, initDemoData, saveProject, deleteProject, exportAllData, importAllData } from '../api/storage';
import { Project } from '../types';
import shared from '../styles/shared.module.css';

const STATUS_CLASS: Record<string, string> = {
  '正常推进': shared.tagNormal,
  '需关注': shared.tagWarning,
  '存在风险': shared.tagDanger,
};

const COLOR_PALETTE = [
  '#378ADD', '#639922', '#D85A30', '#7F77DD',
  '#3DA5A5', '#D4834A', '#B05E99', '#5B8DD6',
];

function emptyProject(): Project {
  return { id: '', name: '', owner: '', startDate: '', status: '正常推进', color: COLOR_PALETTE[0] };
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 项目管理弹窗
  const [projectModal, setProjectModal] = useState<{ open: boolean; editing: Project | null }>({ open: false, editing: null });
  const [editForm, setEditForm] = useState<Project>(emptyProject());

  // 确认删除
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 汇总下钻弹窗
  const [drillDown, setDrillDown] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    initDemoData();
    setProjects(getProjects());
  }, [refreshKey]);

  // ===== 修复 Bug 1: 使用 getAllReports 替代 getReports('') =====
  const allReports = getAllReports();

  // ===== 修复 Bug 2: 使用 computed 值替代硬编码 =====
  const totalCompleted = allReports.reduce((s, r) => s + r.completedItems.length, 0);
  const totalPlanned = allReports.reduce((s, r) => s + r.plannedItems.length, 0);
  const totalRisks = allReports.reduce((s, r) => s + r.risks.length, 0);

  const getProjectStats = (projectId: string) => {
    const prpts = allReports.filter(r => r.projectId === projectId);
    const latestReport = prpts.length > 0 ? prpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b) : null;
    return {
      count: prpts.length,
      progress: latestReport?.progress || 0,
      risks: prpts.reduce((s, r) => s + r.risks.length, 0),
    };
  };

  // ===== 项目管理 =====
  const openCreateModal = () => {
    setEditForm(emptyProject());
    setProjectModal({ open: true, editing: null });
  };

  const openEditModal = (p: Project) => {
    setEditForm({ ...p });
    setProjectModal({ open: true, editing: p });
  };

  const handleSaveProject = () => {
    const project = editForm.id
      ? editForm
      : { ...editForm, id: 'p_' + Date.now() };
    saveProject(project);
    setProjectModal({ open: false, editing: null });
    setRefreshKey(k => k + 1);
    // 修复：判断是否编辑模式，而非判断 project 对象（永远 truthy）
    showToast(editForm.id ? '项目已保存' : '项目已创建', 'success');
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    setConfirmDelete(null);
    setRefreshKey(k => k + 1);
    showToast('项目已删除', 'success');
  };

  // ===== 导入导出 =====
  const handleExport = () => {
    const json = exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importAllData(reader.result as string);
      showToast(result.message, result.success ? 'success' : 'error');
      if (result.success) setRefreshKey(k => k + 1);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 修复：使用 useEffect 监听全局点击来清除确认删除状态，替代脆弱的 onBlur + setTimeout
  useEffect(() => {
    if (confirmDelete === null) return;
    const handler = (e: MouseEvent) => {
      // 如果点击目标是删除按钮本身，不做清除（由 onClick 处理）
      if ((e.target as HTMLElement).closest(`[data-delete-id="${confirmDelete}"]`)) return;
      setConfirmDelete(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [confirmDelete]);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
          {toast.msg}
        </div>
      )}

      {/* 工具栏：添加项目 + 导入导出 */}
      <div className={shared.toolbar}>
        <h2 className={shared.pageTitle} style={{ margin: 0 }}>项目总览</h2>
        <div className={shared.toolbarActions}>
          <button className={shared.btnToolbar} onClick={openCreateModal}>+ 添加项目</button>
          <button className={shared.btnToolbar} onClick={handleExport}>导出数据</button>
          <button className={shared.btnToolbar} onClick={() => fileInputRef.current?.click()}>导入数据</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className={shared.fileInput}
            onChange={handleImport}
          />
        </div>
      </div>

      {/* 项目卡片网格 */}
      <div className={shared.projectGrid}>
        {projects.map(p => {
          const stats = getProjectStats(p.id);
          const tagCls = STATUS_CLASS[p.status] || shared.tagNormal;
          return (
            <div
              key={p.id}
              className={shared.projectCard}
              onClick={(e) => {
                // 如果点击了操作按钮就不要跳转
                if ((e.target as HTMLElement).closest('button')) return;
                navigate(`/project/${p.id}`);
              }}
              style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: p.color }}
            >
              <h3 className={shared.projectName}>{p.name}</h3>
              <div className={shared.projectStats}>
                <div>
                  <div className={shared.statValue} style={{ color: p.color }}>
                    {stats.progress}%
                  </div>
                  <div className={shared.statLabel}>完成进度</div>
                </div>
                <div>
                  <div className={shared.statValue}>{stats.count}</div>
                  <div className={shared.statLabel}>周报(期)</div>
                </div>
                <div>
                  <div className={shared.statValue} style={{ color: stats.risks > 0 ? '#D85A30' : '#333' }}>
                    {stats.risks}
                  </div>
                  <div className={shared.statLabel}>风险项</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`${shared.badge} ${tagCls}`}>{p.status}</span>
                  <span className={shared.textMuted}>负责人: {p.owner}</span>
                </div>
                <div className={shared.projectActions}>
                  <button
                    className={shared.actionBtn}
                    onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                  >
                    编辑
                  </button>
                  <button
                    data-delete-id={p.id}
                    className={`${shared.actionBtn} ${shared.actionBtnDanger}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmDelete === p.id) {
                        handleDeleteProject(p.id);
                      } else {
                        setConfirmDelete(p.id);
                      }
                    }}
                  >
                    {confirmDelete === p.id ? '确认删除？' : '删除'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className={shared.emptyState}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无项目</p>
          <p className={shared.textSmall}>点击上方「添加项目」创建第一个项目</p>
        </div>
      )}

      {/* 本周汇总 */}
      {projects.length > 0 && (
        <div className={shared.summaryPanel}>
          <h3 className={shared.sectionTitle}>本周汇总</h3>
          <div className={shared.summaryGrid}>
            {[
              { key: 'completed', val: totalCompleted, label: '累计完成事项', color: '#378ADD' },
              { key: 'planned', val: totalPlanned, label: '累计计划事项', color: '#639922' },
              { key: 'risks', val: totalRisks, label: '累计风险项', color: '#D85A30' },
              { key: 'members', val: projects.length, label: '协作成员', color: '#7F77DD' },
            ].map((item, i) => (
              <div
                key={i}
                className={`${shared.summaryItem} ${shared.summaryClickable}`}
                onClick={() => setDrillDown(item.key)}
              >
                <div className={shared.summaryValue} style={{ color: item.color }}>{item.val}</div>
                <div className={shared.summaryLabel}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 汇总下钻弹窗 */}
      {drillDown && (
        <div className={shared.drillOverlay} onClick={() => setDrillDown(null)}>
          <div className={shared.drillPanel} onClick={e => e.stopPropagation()}>
            <div className={shared.drillHeader}>
              <h3 className={shared.drillTitle}>
                {drillDown === 'completed' ? '累计完成事项详情' :
                 drillDown === 'planned' ? '累计计划事项详情' :
                 drillDown === 'risks' ? '累计风险项详情' : '协作成员列表'}
              </h3>
              <button className={shared.drillClose} onClick={() => setDrillDown(null)}>×</button>
            </div>
            {drillDown === 'members' ? (
              projects.map(p => (
                <div key={p.id} className={shared.drillGroup}>
                  <div className={shared.drillGroupTitle}>
                    <span className={shared.drillGroupDot} style={{ background: p.color }} />
                    {p.name}
                  </div>
                  <div className={shared.drillItem}>
                    负责人：<span style={{ fontWeight: 500, color: '#333' }}>{p.owner}</span>
                    <span className={shared.drillOwner}> · 状态：{p.status} · 启动：{p.startDate}</span>
                  </div>
                </div>
              ))
            ) : (
              projects.map(p => {
                const prpts = allReports.filter(r => r.projectId === p.id);
                const items: string[] = [];
                if (drillDown === 'completed') {
                  prpts.forEach(r => r.completedItems.forEach(ci => items.push(ci.title)));
                } else if (drillDown === 'planned') {
                  prpts.forEach(r => r.plannedItems.forEach(pi => items.push(pi.title)));
                } else {
                  prpts.forEach(r => r.risks.forEach(rk => items.push(`[${rk.level}] ${rk.description}${rk.suggestion ? ' → ' + rk.suggestion : ''}`)));
                }
                if (items.length === 0) return null;
                return (
                  <div key={p.id} className={shared.drillGroup}>
                    <div className={shared.drillGroupTitle}>
                      <span className={shared.drillGroupDot} style={{ background: p.color }} />
                      {p.name}
                      <span className={shared.drillOwner}>（{p.owner}）— 共{items.length}项</span>
                    </div>
                    {items.map((txt, j) => (
                      <div key={j} className={shared.drillItem}>{j + 1}. {txt}</div>
                    ))}
                  </div>
                );
              })
            )}
            {drillDown !== 'members' && (
              <div className={shared.drillItem} style={{ color: '#999', textAlign: 'center', marginTop: 12 }}>
                — 共 {drillDown === 'completed' ? totalCompleted : drillDown === 'planned' ? totalPlanned : totalRisks} 项 —
              </div>
            )}
          </div>
        </div>
      )}

      {/* 项目编辑弹窗 */}
      {projectModal.open && (
        <div className={shared.modalOverlay} onClick={() => setProjectModal({ open: false, editing: null })}>
          <div className={shared.modal} onClick={e => e.stopPropagation()}>
            <div className={shared.modalHeader}>
              <h3 className={shared.modalTitle}>{editForm.id ? '编辑项目' : '新增项目'}</h3>
              <button className={shared.modalClose} onClick={() => setProjectModal({ open: false, editing: null })}>×</button>
            </div>
            <div className={shared.modalBody}>
              <div>
                <label className={shared.formLabel}>项目名称</label>
                <input
                  className={shared.formInput}
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="输入项目名称"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={shared.formGroup}>
                  <label className={shared.formLabel}>负责人</label>
                  <input
                    className={shared.formInput}
                    value={editForm.owner}
                    onChange={e => setEditForm({ ...editForm, owner: e.target.value })}
                    placeholder="负责人姓名"
                  />
                </div>
                <div className={shared.formGroup}>
                  <label className={shared.formLabel}>启动日期</label>
                  <input
                    className={shared.formInput}
                    type="date"
                    value={editForm.startDate}
                    onChange={e => setEditForm({ ...editForm, startDate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={shared.formLabel}>项目状态</label>
                <select
                  className={shared.formSelect}
                  style={{ width: '100%', padding: '8px 12px' }}
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as Project['status'] })}
                >
                  <option value="正常推进">正常推进</option>
                  <option value="需关注">需关注</option>
                  <option value="存在风险">存在风险</option>
                </select>
              </div>
              <div>
                <label className={shared.formLabel}>项目颜色</label>
                <div className={shared.colorGrid}>
                  {COLOR_PALETTE.map(c => (
                    <div
                      key={c}
                      className={`${shared.colorSwatch} ${editForm.color === c ? shared.colorSwatchActive : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditForm({ ...editForm, color: c })}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className={shared.modalFooter}>
              <button className={shared.btnOutline} onClick={() => setProjectModal({ open: false, editing: null })}>取消</button>
              <button
                className={shared.btnPrimaryLg}
                onClick={handleSaveProject}
                disabled={!editForm.name.trim()}
              >
                {editForm.id ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
