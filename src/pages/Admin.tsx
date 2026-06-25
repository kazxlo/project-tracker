import { useState, useEffect, useMemo } from 'react';
import { getAllProfiles, UserProfile } from '../api/profiles';
import { getProjects, saveProject } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { Project } from '../types';
import shared from '../styles/shared.module.css';

// 内嵌子组件
import Dashboard from './Dashboard';
import AdminUsers from './AdminUsers';

type TabKey = 'overview' | 'permissions' | 'users';

export default function Admin() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<TabKey>('overview');

  // 非 admin 重定向（Layout已做，双重保险）
  if (!isAdmin) return null;

  return (
    <div>
      <h2 className={shared.pageTitle}>管理中心</h2>

      <div className={shared.tabBar}>
        {[
          { key: 'overview' as TabKey, label: '项目总览' },
          { key: 'permissions' as TabKey, label: '项目权限' },
          { key: 'users' as TabKey, label: '用户管理' },
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

      {tab === 'overview' && <Dashboard />}
      {tab === 'permissions' && <ProjectPermissions />}
      {tab === 'users' && <AdminUsers />}
    </div>
  );
}

/** 项目权限Tab */
function ProjectPermissions() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projs, profs] = await Promise.all([getProjects(), getAllProfiles()]);
        if (!cancelled) {
          setProjects(projs);
          setProfiles(profs);
        }
      } catch {
        if (!cancelled) showToast('加载数据失败', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // 切换用户可见性
  const toggleViewer = (projectId: string, userId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const current = p.viewerIds || [];
      if (current.includes(userId)) {
        return { ...p, viewerIds: current.filter(id => id !== userId) };
      } else {
        return { ...p, viewerIds: [...current, userId] };
      }
    }));
  };

  // 保存单个项目权限（含子项目继承）
  const handleSave = async (project: Project) => {
    setSaving(project.id);
    try {
      // 保存父项目权限
      await saveProject(project);
      // 子项目继承父项目 viewerIds
      const children = projects.filter(p => p.parentId === project.id);
      for (const child of children) {
        await saveProject({ ...child, viewerIds: project.viewerIds });
      }
      showToast(
        children.length > 0
          ? `${project.name} 权限已保存（${children.length}个子项目自动继承）`
          : `${project.name} 权限已保存`,
        'success'
      );
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(null);
    }
  };

  // 仅展示顶层项目
  const topProjects = projects.filter(p => !p.parentId);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#6b7a93' }}>加载中...</div>;
  }

  return (
    <div>
      {toast && (
        <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
          {toast.msg}
        </div>
      )}

      {topProjects.length === 0 ? (
        <div className={shared.emptyState}>暂无项目</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {topProjects.map(p => {
            const viewerIds = p.viewerIds || [];
            const childCount = projects.filter(c => c.parentId === p.id).length;
            return (
              <div key={p.id} className={shared.section} style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />
                  <h3 className={shared.sectionTitle} style={{ margin: 0, flex: 1 }}>
                    {p.name}
                    {childCount > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7a93', marginLeft: 8 }}>
                        ({childCount}个子项目自动继承)
                      </span>
                    )}
                  </h3>
                  <span className={shared.textSmall} style={{ color: '#6b7a93' }}>
                    {viewerIds.length === 0 ? '所有人可见' : `${viewerIds.length}人可见`}
                  </span>
                  <button
                    className={shared.btnPrimary}
                    style={{ fontSize: 12, padding: '4px 14px' }}
                    onClick={() => handleSave(p)}
                    disabled={saving === p.id}
                  >
                    {saving === p.id ? '保存中...' : '保存'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {profiles.map(prof => {
                    const checked = viewerIds.includes(prof.id);
                    return (
                      <label
                        key={prof.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 12px',
                          borderRadius: 6,
                          background: checked ? 'rgba(79,142,247,0.06)' : '#f8f9fc',
                          border: checked ? '1px solid rgba(79,142,247,0.2)' : '1px solid #e8ecf2',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: checked ? '#4F8EF7' : '#6b7a93',
                          userSelect: 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleViewer(p.id, prof.id)}
                          style={{ accentColor: '#4F8EF7' }}
                        />
                        {prof.display_name}
                      </label>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#9aa3b2', marginTop: 10 }}>
                  {viewerIds.length === 0
                    ? '未勾选任何人 = 所有用户可见'
                    : '仅勾选的成员 + 管理员本人 可见此项目'}
                  {childCount > 0 && ' · 保存后子项目自动继承相同权限'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
