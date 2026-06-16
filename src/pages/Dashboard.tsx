import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getAllReports, saveProject, deleteProject, exportAllData, importAllData } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { exportWeeklySummaryPDF } from '../utils/pdfExport';
import { Project } from '../types';
import ProjectExportModal from '../components/ProjectExportModal';
import shared from '../styles/shared.module.css';

const STATUS_CLASS: Record<string, string> = {
  '正常推进': shared.tagNormal,
  '需关注': shared.tagWarning,
  '存在风险': shared.tagDanger,
};

const COLOR_PALETTE = [
  '#5B9EF5', '#4ADE80', '#FB923C', '#A78BFA',
  '#2DD4BF', '#FBBF24', '#F472B6', '#60A5FA',
];

function emptyProject(): Project {
  return { id: '', name: '', owner: '', startDate: '', deadline: '', deadlineExtensions: 0, status: '正常推进', color: COLOR_PALETTE[0], parentId: undefined, description: '', serviceStart: '', serviceEnd: '' };
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allReports, setAllReports] = useState<Awaited<ReturnType<typeof getAllReports>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const isPublic = role === 'public';
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 项目管理弹窗
  const [projectModal, setProjectModal] = useState<{ open: boolean; editing: Project | null }>({ open: false, editing: null });
  const [editForm, setEditForm] = useState<Project>(emptyProject());

  // 确认删除
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 汇总下钻弹窗
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projs, reps] = await Promise.all([getProjects(), getAllReports()]);
        if (!cancelled) {
          setProjects(projs);
          setAllReports(reps);
        }
      } catch (err) {
        console.error('加载数据失败:', err);
        if (!cancelled) showToast('加载数据失败，请刷新重试', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // 剩余计划事项：所有plannedItems中未被后续周报completedItems覆盖的
  // 逻辑：每个项目的最新plannedItems即为剩余计划事项
  const remainingPlanned = projects.reduce((total, p) => {
    const prpts = allReports.filter(r => r.projectId === p.id);
    if (prpts.length === 0) return total;
    // 按时间排序，取最新一期周报的plannedItems作为剩余计划
    const latest = prpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b);
    // 过滤掉reason标记为已完成（已被后续周报确认完成移入completed的）
    const remaining = latest.plannedItems.filter(pi => !pi.carriedForward);
    return total + remaining.length;
  }, 0);

  // 累计风险项（去重：同一项目下description相同只计一次）
  const totalRisks = projects.reduce((total, p) => {
    const prpts = allReports.filter(r => r.projectId === p.id);
    const seen = new Set<string>();
    let count = 0;
    prpts.forEach(r => {
      r.risks.forEach(rk => {
        const key = rk.description.trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          count++;
        }
      });
    });
    return total + count;
  }, 0);

  // 累计完成事项（去重：同一项目下 title 相同只计一次）
  const totalCompleted = projects.reduce((total, p) => {
    const prpts = allReports.filter(r => r.projectId === p.id);
    const seen = new Set<string>();
    prpts.forEach(r => {
      r.completedItems.forEach(ci => {
        const key = ci.title.trim();
        if (key && !seen.has(key)) {
          seen.add(key);
        }
      });
    });
    return total + seen.size;
  }, 0);

  const getProjectStats = (projectId: string) => {
    const prpts = allReports.filter(r => r.projectId === projectId);
    const latestReport = prpts.length > 0 ? prpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b) : null;
    // 风险去重：同一description只计一次
    const riskSeen = new Set<string>();
    const uniqueRisks = prpts.reduce((count, r) => {
      r.risks.forEach(rk => {
        const key = rk.description.trim();
        if (key) riskSeen.add(key);
      });
      return count;
    }, 0);
    return {
      count: prpts.length,
      progress: latestReport?.progress || 0,
      risks: riskSeen.size,
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

  const handleSaveProject = async () => {
    // 编辑已有项目时，检测截止时间是否延期（新截止日期晚于旧截止日期才记录）
    let project = editForm;
    if (editForm.id && projectModal.editing) {
      const oldProject = projectModal.editing;
      if (project.deadline && oldProject.deadline && project.deadline !== oldProject.deadline && project.deadline > oldProject.deadline) {
        // 截止时间延后，记录延期
        project = {
          ...project,
          deadlineExtensions: (project.deadlineExtensions || 0) + 1,
          lastDeadline: oldProject.deadline,
        };
        setEditForm(project); // 同步状态
      }
    }
    const finalProject = project.id
      ? project
      : { ...project, id: 'p_' + Date.now() };
    try {
      await saveProject(finalProject);
      setProjectModal({ open: false, editing: null });
      setRefreshKey(k => k + 1);
      showToast(editForm.id ? '项目已保存' : '项目已创建', 'success');
    } catch (err) {
      console.error('保存项目失败:', err);
      showToast('保存失败，请重试', 'error');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      setConfirmDelete(null);
      setRefreshKey(k => k + 1);
      showToast('项目已删除', 'success');
    } catch (err) {
      console.error('删除项目失败:', err);
      showToast('删除失败，请重试', 'error');
    }
  };

  // ===== 导入导出 =====
  const handleExport = async () => {
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('数据已导出', 'success');
    } catch (err) {
      console.error('导出失败:', err);
      showToast('导出失败', 'error');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await importAllData(reader.result as string);
        showToast(result.message, result.success ? 'success' : 'error');
        if (result.success) setRefreshKey(k => k + 1);
      } catch (err) {
        console.error('导入失败:', err);
        showToast('导入失败', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 全局点击清除确认删除状态
  useEffect(() => {
    if (confirmDelete === null) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(`[data-delete-id="${confirmDelete}"]`)) return;
      setConfirmDelete(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [confirmDelete]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
          {toast.msg}
        </div>
      )}

      {/* 工具栏 */}
      <div className={shared.toolbar}>
        <h2 className={shared.pageTitle} style={{ margin: 0 }}>项目总览</h2>
        <div className={shared.toolbarActions}>
          {isAdmin && (
            <button className={shared.btnToolbar} onClick={openCreateModal}>+ 添加项目</button>
          )}
          {!isPublic && (
            <button className={shared.btnToolbar} onClick={() => setShowExportModal(true)}>
              📄 导出PDF
            </button>
          )}
          {isAdmin && (
            <button className={shared.btnToolbar} onClick={handleExport}>导出数据</button>
          )}
          {isAdmin && (
            <>
              <button className={shared.btnToolbar} onClick={() => fileInputRef.current?.click()}>导入数据</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className={shared.fileInput}
                onChange={handleImport}
              />
            </>
          )}
        </div>
      </div>

      {/* 项目逾期提醒 */}
      {(() => {
        const overdue = projects.filter(p => {
          if (!p.deadline || p.deadline.trim() === '') return false;
          const today = new Date().toISOString().split('T')[0];
          if (p.deadline >= today) return false;
          const stats = getProjectStats(p.id);
          return stats.progress < 100;
        });
        if (overdue.length === 0) return null;
        return (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdue.map(p => {
              const deadlineDate = p.deadline!;
              const d = new Date(deadlineDate + 'T00:00:00');
              const deadlineStr = `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
              const extInfo = p.deadlineExtensions && p.deadlineExtensions > 0
                ? `（已延期${p.deadlineExtensions}次，上一次截止时间为${p.lastDeadline ? (() => { const ld = new Date(p.lastDeadline + 'T00:00:00'); return `${ld.getFullYear()}年${String(ld.getMonth() + 1).padStart(2, '0')}月${String(ld.getDate()).padStart(2, '0')}日`; })() : deadlineStr}）`
                : '';
              return (
                <div key={p.id} style={{
                  background: '#FFF3E0',
                  border: '1px solid #FF9800',
                  borderRadius: 8,
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ flex: 1, color: '#E65100' }}>
                    <strong>{p.name}</strong> 项目已超过预估截止时间（{deadlineStr}），请核实并控制交付质量。{extInfo}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 项目卡片网格（仅展示顶层项目，子项目在父项目详情页查看） */}
      <div className={shared.projectGrid}>
        {projects.filter(p => !p.parentId).map(p => {
          const stats = getProjectStats(p.id);
          const tagCls = STATUS_CLASS[p.status] || shared.tagNormal;
          return (
            <div
              key={p.id}
              className={shared.projectCard}
              onClick={(e) => {
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
                  <div className={shared.statValue} style={{ color: stats.risks > 0 ? '#FB923C' : '#1c2a44' }}>
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
                {isAdmin && (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {projects.filter(p => !p.parentId).length === 0 && (
        <div className={shared.emptyState}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无项目</p>
          <p className={shared.textSmall}>点击上方「添加项目」创建第一个项目</p>
        </div>
      )}

      {/* 整体汇总 */}
      {projects.filter(p => !p.parentId).length > 0 && (
        <div className={shared.summaryPanel}>
          <h3 className={shared.sectionTitle}>整体汇总</h3>
          <div className={shared.summaryGrid}>
            {[
              { key: 'completed', val: totalCompleted, label: '累计完成事项', color: '#4F8EF7' },
              { key: 'planned', val: remainingPlanned, label: '剩余计划事项', color: '#4ADE80' },
              { key: 'risks', val: totalRisks, label: '累计风险项', color: '#FB923C' },
              { key: 'members', val: projects.filter(p => !p.parentId).length, label: '协作成员', color: '#7F77DD' },
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
                 drillDown === 'planned' ? '剩余计划事项详情' :
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
                  const seen = new Set<string>();
                  prpts.forEach(r => r.completedItems.forEach(ci => {
                    const key = ci.title.trim();
                    if (key && !seen.has(key)) {
                      seen.add(key);
                      items.push(ci.title);
                    }
                  }));
                } else if (drillDown === 'planned') {
                  // 剩余计划事项：取最新一期周报的plannedItems
                  if (prpts.length > 0) {
                    const latest = prpts.reduce((a, b) => a.weekStart > b.weekStart ? a : b);
                    latest.plannedItems.filter(pi => !pi.carriedForward).forEach(pi => {
                      items.push(pi.title + (pi.reason ? `（未完成原因：${pi.reason}）` : ''));
                    });
                  }
                } else {
                  // 风险去重
                  const seen = new Set<string>();
                  prpts.forEach(r => {
                    r.risks.forEach(rk => {
                      const key = rk.description.trim();
                      if (key && !seen.has(key)) {
                        seen.add(key);
                        items.push(`[${rk.level}] ${rk.description}${rk.suggestion ? ' → ' + rk.suggestion : ''}`);
                      }
                    });
                  });
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
                — 共 {drillDown === 'completed' ? totalCompleted : drillDown === 'planned' ? remainingPlanned : totalRisks} 项 —
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
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={shared.formGroup}>
                  <label className={shared.formLabel}>预估截止时间</label>
                  <input
                    className={shared.formInput}
                    type="date"
                    value={editForm.deadline || ''}
                    onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                  />
                </div>
                <div className={shared.formGroup}>
                  {editForm.deadlineExtensions && editForm.deadlineExtensions > 0 ? (
                    <div style={{ fontSize: 12, color: '#FB923C', paddingTop: 20 }}>
                      ⚠ 已延期{editForm.deadlineExtensions}次
                      {editForm.lastDeadline ? `，上一次截止时间：${(() => {
                        const ld = new Date(editForm.lastDeadline + 'T00:00:00');
                        return `${ld.getFullYear()}年${String(ld.getMonth() + 1).padStart(2, '0')}月${String(ld.getDate()).padStart(2, '0')}日`;
                      })()}` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#999', paddingTop: 20 }}>
                      设定后若逾期且进度未达100%将提示
                    </div>
                  )}
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
                <label className={shared.formLabel}>服务内容</label>
                <textarea
                  className={shared.formTextarea}
                  rows={2}
                  value={editForm.description || ''}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="简述服务内容（可选）"
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className={shared.formGroup}>
                  <label className={shared.formLabel}>服务期开始</label>
                  <input
                    className={shared.formInput}
                    type="date"
                    value={editForm.serviceStart || ''}
                    onChange={e => setEditForm({ ...editForm, serviceStart: e.target.value })}
                  />
                </div>
                <div className={shared.formGroup}>
                  <label className={shared.formLabel}>服务期结束</label>
                  <input
                    className={shared.formInput}
                    type="date"
                    value={editForm.serviceEnd || ''}
                    onChange={e => setEditForm({ ...editForm, serviceEnd: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={shared.formLabel}>所属父项目</label>
                <select
                  className={shared.formSelect}
                  style={{ width: '100%', padding: '8px 12px' }}
                  value={editForm.parentId || ''}
                  onChange={e => setEditForm({ ...editForm, parentId: e.target.value || undefined })}
                >
                  <option value="">无（顶层项目）</option>
                  {projects
                    .filter(p => !p.parentId && p.id !== editForm.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
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
    </div>
  );
}
