import { useState, useEffect, useMemo } from 'react';
import { getAllProfiles, UserProfile } from '../api/profiles';
import { getProjects, saveProject } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { filterVisibleProjects } from '../utils/helpers';
import type { Project } from '../types';
import Toast from '../components/Toast';
import shared from '../styles/shared.module.css';

import Dashboard from './Dashboard';
import AdminUsers from './AdminUsers';

type TabKey = 'overview' | 'permissions' | 'users';

export default function Admin() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<TabKey>('overview');

  if (!isAdmin) return null;

  const tabs = [
    { key: 'overview' as TabKey, label: '项目总览' },
    { key: 'permissions' as TabKey, label: '项目权限' },
    { key: 'users' as TabKey, label: '用户管理' },
  ];

  return (
    <div className={shared.pageWrap}>
      <main className={shared.main}>
        <div className={shared.tabBar}>
          {tabs.map(t => (
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
      </main>
    </div>
  );
}

/** 项目权限Tab */
function ProjectPermissions() {
  const { userId, role } = useAuth();
  const { toast, showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projs, profs] = await Promise.all([getProjects(), getAllProfiles()]);
        if (!cancelled) {
          setProjects(filterVisibleProjects(projs, userId, role));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  const toggleViewer = (projectId: string, targetUserId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const current = p.viewerIds || [];
      if (current.includes(targetUserId)) return { ...p, viewerIds: current.filter(id => id !== targetUserId) };
      return { ...p, viewerIds: [...current, targetUserId] };
    }));
  };

  const handleSave = async (project: Project) => {
    setSaving(project.id);
    try {
      await saveProject(project);
      const children = projects.filter(p => p.parentId === project.id);
      for (const child of children) {
        await saveProject({ ...child, viewerIds: project.viewerIds });
      }
      showToast(children.length > 0 ? `${project.name} 权限已保存（${children.length}个子项目自动继承）` : `${project.name} 权限已保存`, 'success');
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(null);
    }
  };

  const topProjects = projects.filter(p => !p.parentId);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>;

  return (
    <div>
      <Toast toast={toast} />
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
                    {childCount > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 8 }}>({childCount}个子项目自动继承)</span>}
                  </h3>
                  <span className={shared.textSmall} style={{ color: 'var(--color-text-secondary)' }}>{viewerIds.length === 0 ? '所有人可见' : `${viewerIds.length}人可见`}</span>
                  <button className={shared.btnPrimary} style={{ fontSize: 12, padding: '4px 14px' }} onClick={() => handleSave(p)} disabled={saving === p.id}>{saving === p.id ? '保存中...' : '保存'}</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {profiles.map(prof => {
                    const checked = viewerIds.includes(prof.id);
                    return (
                      <label key={prof.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 6, background: checked ? 'var(--color-primary-light)' : 'var(--color-bg-alt)', border: checked ? '1px solid rgba(79,142,247,0.2)' : '1px solid #e8ecf2', cursor: 'pointer', fontSize: 13, color: checked ? 'var(--color-primary)' : 'var(--color-text-secondary)', userSelect: 'none', transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleViewer(p.id, prof.id)} style={{ accentColor: 'var(--color-primary)' }} />
                        {prof.display_name}
                      </label>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>
                  {viewerIds.length === 0 ? '未勾选任何人 = 所有用户可见' : '仅勾选的成员 + 管理员本人 可见此项目'}
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
