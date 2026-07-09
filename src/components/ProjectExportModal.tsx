import { useState, useMemo, useEffect } from 'react';
import { getLatestReport, formatDate } from '../utils/helpers';
import type { Project, WeeklyReport } from '../types';
import shared from '../styles/shared.module.css';

interface Props {
  projects: Project[];
  allReports: WeeklyReport[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

export default function ProjectExportModal({ projects, allReports, onConfirm, onCancel }: Props) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(projects.map(p => p.id))
  );

  // projects 变化时同步默认全选（修复 useState 初始值不随 props 更新的问题）
  useEffect(() => {
    setSelectedIds(new Set(projects.map(p => p.id)));
  }, [projects]);

  // 获取项目最新周报信息
  const reportMap = useMemo(() => {
    const map: Record<string, { label: string; date: string } | null> = {};
    projects.forEach(p => {
      const prpts = allReports.filter(r => r.projectId === p.id);
      const latest = getLatestReport(prpts);
      if (!latest) {
        map[p.id] = null;
        return;
      }
      map[p.id] = { label: latest.weekLabel, date: formatDate(latest.weekStart) };
    });
    return map;
  }, [projects, allReports]);

  // 构建层级分组
  const grouped = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    return topProjects.map(p => {
      const children = projects.filter(c => c.parentId === p.id);
      return { parent: p, children };
    });
  }, [projects]);

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map(g => ({
        ...g,
        children: g.children.filter(c => c.name.toLowerCase().includes(q)),
      }))
      .filter(g =>
        g.parent.name.toLowerCase().includes(q) ||
        g.children.length > 0
      );
  }, [grouped, search]);

  const allSelected = selectedIds.size === projects.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map(p => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const childIds = projects.filter(p => p.parentId === id).map(p => p.id);
      if (next.has(id)) {
        next.delete(id);
        childIds.forEach(cid => next.delete(cid));
      } else {
        next.add(id);
        childIds.forEach(cid => next.add(cid));
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const ids = projects.filter(p => selectedIds.has(p.id)).map(p => p.id);
    if (ids.length === 0) return;
    onConfirm(ids);
  };

  return (
    <div className={shared.modalOverlay} onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 24,
          padding: '24px 28px',
          minWidth: 520,
          maxWidth: 620,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 28px rgba(0,0,0,0.04)',
          border: '1px solid var(--color-border-light)',
        }}
      >
        {/* Header */}
        <div className={shared.modalHeader} style={{ marginBottom: 16 }}>
          <h3 className={shared.modalTitle}>选择导出项目</h3>
          <button className={shared.modalClose} onClick={onCancel}>×</button>
        </div>

        {/* 工具栏：搜索 + 全选 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            className={shared.formInput}
            style={{ flex: 1 }}
            placeholder="搜索项目名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className={shared.btnToolbar}
            onClick={toggleSelectAll}
            style={{ whiteSpace: 'nowrap' }}
          >
            {allSelected ? '取消全选' : '全选'}
          </button>
        </div>

        {/* 项目列表 */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, maxHeight: '50vh' }}>
          {filteredGroups.map(g => (
            <div key={g.parent.id} style={{ marginBottom: 12 }}>
              {/* 父项目 */}
              <ProjectRow
                project={g.parent}
                selected={selectedIds.has(g.parent.id)}
                onToggle={() => toggleOne(g.parent.id)}
                report={reportMap[g.parent.id]}
                indent={0}
              />
              {/* 子项目 */}
              {g.children.map(c => (
                <ProjectRow
                  key={c.id}
                  project={c}
                  selected={selectedIds.has(c.id)}
                  onToggle={() => toggleOne(c.id)}
                  report={reportMap[c.id]}
                  indent={1}
                />
              ))}
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-secondary)', fontSize: 13 }}>
              无匹配项目
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            已选 {selectedIds.size} / {projects.length} 个项目
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={shared.btnOutline} onClick={onCancel}>取消</button>
            <button
              className={shared.btnPrimary}
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
            >
              导出PDF（{selectedIds.size}）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  onToggle,
  report,
  indent,
}: {
  project: Project;
  selected: boolean;
  onToggle: () => void;
  report: { label: string; date: string } | null;
  indent: number;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 8px 8px 0',
        cursor: 'pointer',
        borderRadius: 6,
        transition: 'background 0.1s',
        marginBottom: 2,
        paddingLeft: indent * 24 + 4,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.02)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }}
      />
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: project.color,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--color-text)' }}>
        {project.name}
        {indent > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>↳ 子项目</span>
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginRight: 12 }}>{project.owner}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 100, textAlign: 'right' }}>
        {report ? `${report.label}${report.date ? ` · ${report.date}` : ''}` : '无周报'}
      </span>
    </label>
  );
}
