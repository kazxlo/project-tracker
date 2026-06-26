import { useState, useEffect, useRef } from 'react';
import { getMilestones, saveMilestone, deleteMilestone, getProjectTasks, saveProjectTask, deleteProjectTask } from '../api/db';
import { genId } from '../utils/helpers';
import type { Milestone, ProjectTask } from '../types';
import shared from '../styles/shared.module.css';

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  toast: (msg: string, type: 'success' | 'error') => void;
  readOnly?: boolean;
}

type EditTab = 'milestones' | 'tasks';

export default function ProjectPlanEditor({ projectId, open, onClose, toast, readOnly }: Props) {
  const [tab, setTab] = useState<EditTab>('milestones');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);

  const load = async (reqId: number) => {
    try {
      const [ms, ts] = await Promise.all([
        getMilestones(projectId),
        getProjectTasks(projectId),
      ]);
      if (reqId !== reqIdRef.current) return; // 过时响应丢弃，防竞态
      setMilestones(ms);
      setTasks(ts);
    } catch {
      if (reqId === reqIdRef.current) toast('加载计划数据失败', 'error');
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setLoading(true);
      const reqId = ++reqIdRef.current;
      load(reqId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = () => load(++reqIdRef.current);

  if (!open) return null;

  const handleDeleteMilestone = async (id: string) => {
    try {
      await deleteMilestone(id);
      await reload();
      toast('里程碑已删除', 'success');
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteProjectTask(id);
      await reload();
      toast('任务已删除', 'success');
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleReorderMilestones = async (ms: Milestone[]) => {
    try {
      await Promise.all(ms.map(m => saveMilestone(m)));
      await reload();
      toast('排序已保存', 'success');
    } catch {
      toast('排序保存失败', 'error');
    }
  };

  const handleReorderTasks = async (ts: ProjectTask[]) => {
    try {
      await Promise.all(ts.map(t => saveProjectTask(t)));
      await reload();
      toast('排序已保存', 'success');
    } catch {
      toast('排序保存失败', 'error');
    }
  };

  return (
    <div className={shared.modalOverlay} onClick={onClose}>
      <div
        className={shared.modal}
        onClick={e => e.stopPropagation()}
        style={{ minWidth: 560, maxWidth: 680, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className={shared.modalHeader}>
          <h3 className={shared.modalTitle}>项目计划管理</h3>
          <button className={shared.modalClose} onClick={onClose}>×</button>
        </div>

        <div className={shared.tabBar} style={{ marginBottom: 0 }}>
          <span
            onClick={() => setTab('milestones')}
            className={`${shared.tab} ${tab === 'milestones' ? shared.tabActive : shared.tabInactive}`}
          >
            里程碑
          </span>
          <span
            onClick={() => setTab('tasks')}
            className={`${shared.tab} ${tab === 'tasks' ? shared.tabActive : shared.tabInactive}`}
          >
            项目任务
          </span>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingTop: 12 }}>
          {tab === 'milestones' && (
            <MilestoneEditor
              milestones={milestones}
              setMilestones={setMilestones}
              projectId={projectId}
              onDelete={handleDeleteMilestone}
              onReorder={handleReorderMilestones}
              loading={loading}
              reload={reload}
              toast={toast}
              readOnly={readOnly}
            />
          )}
          {tab === 'tasks' && (
            <TaskEditor
              tasks={tasks}
              setTasks={setTasks}
              projectId={projectId}
              onDelete={handleDeleteTask}
              onReorder={handleReorderTasks}
              loading={loading}
              reload={reload}
              toast={toast}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** 排序按钮组（里程碑/任务共用，消除重复） */
function ReorderButtons({ onUp, onDown, disabledUp, disabledDown }: {
  onUp: () => void; onDown: () => void; disabledUp: boolean; disabledDown: boolean;
}) {
  const btn = (onClick: () => void, disabled: boolean, label: string, title: string) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22, height: 18, border: 'none', borderRadius: 3,
        background: disabled ? '#f0f2f7' : '#e5e7eb',
        color: disabled ? '#bfc8d6' : '#6b7a93',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 10, lineHeight: '18px', padding: 0,
      }}
      title={title}
    >{label}</button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2, flexShrink: 0 }}>
      {btn(onUp, disabledUp, '▲', '上移')}
      {btn(onDown, disabledDown, '▼', '下移')}
    </div>
  );
}

function emptyMilestone(projectId: string): Milestone {
  return { id: '', projectId, name: '', status: '待开始', sortOrder: 0 };
}

function MilestoneEditor({
  milestones, setMilestones, projectId, onDelete, onReorder, loading, reload, toast, readOnly,
}: {
  milestones: Milestone[];
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  projectId: string;
  onDelete: (id: string) => void;
  onReorder: (milestones: Milestone[]) => void;
  loading: boolean;
  reload: () => Promise<void>;
  toast: (msg: string, type: 'success' | 'error') => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [isNew, setIsNew] = useState(false);

  const add = () => {
    setEditing({ ...emptyMilestone(projectId), sortOrder: milestones.length });
    setIsNew(true);
  };
  const cancel = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    const final: Milestone = editing.id ? editing : { ...editing, id: genId('ms_') };
    try {
      if (!editing.id) {
        // 新建：按目标日期插入合适位置
        if (final.targetDate) {
          let insertIdx = milestones.length;
          for (let i = 0; i < milestones.length; i++) {
            if (!milestones[i].targetDate || milestones[i].targetDate! > final.targetDate) {
              insertIdx = i;
              break;
            }
          }
          final.sortOrder = insertIdx;
        } else {
          final.sortOrder = milestones.length;
        }
        await saveMilestone(final);
        if (final.sortOrder < milestones.length) {
          await Promise.all(milestones.slice(final.sortOrder).map((m, i) => saveMilestone({ ...m, sortOrder: final.sortOrder + i + 1 })));
        }
      } else {
        await saveMilestone(final);
      }
      await reload();
      setEditing(null);
      setIsNew(false);
      toast('里程碑已保存', 'success');
    } catch {
      toast('保存失败', 'error');
    }
  };

  // 交换并生成全新数组/对象，避免 mutate 原对象
  const reorder = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= milestones.length) return;
    const list = milestones.map((m, i) => {
      if (i === index) return { ...m, sortOrder: target };
      if (i === target) return { ...m, sortOrder: index };
      return { ...m, sortOrder: i };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
    setMilestones(list);
    onReorder(list);
  };

  if (loading) return <div className={shared.emptyState}>加载中...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {milestones.length === 0 && !editing && (
        <div className={shared.emptyState} style={{ padding: '20px 0' }}>暂无里程碑，点击下方按钮添加</div>
      )}

      {milestones.map((m, i) => (
        <div key={m.id} className={shared.riskBlock} style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {!readOnly && (
              <ReorderButtons onUp={() => reorder(i, -1)} onDown={() => reorder(i, 1)} disabledUp={i === 0} disabledDown={i === milestones.length - 1} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</span>
                <span className={shared.badge} style={{
                  fontSize: 10, padding: '1px 8px',
                  background: m.status === '已完成' ? '#EAF3DE' : m.status === '进行中' ? '#E6F1FB' : '#f0f2f7',
                  color: m.status === '已完成' ? '#3B6D11' : m.status === '进行中' ? '#185FA5' : '#6b7a93',
                }}>{m.status}</span>
              </div>
              {m.targetDate && <div style={{ fontSize: 11, color: '#6b7a93', marginTop: 2 }}>目标日期: {m.targetDate}</div>}
              {m.description && <div style={{ fontSize: 11, color: '#6b7a93', marginTop: 2 }}>{m.description}</div>}
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className={shared.actionBtn} onClick={() => { setEditing({ ...m }); setIsNew(false); }}>编辑</button>
                <button className={`${shared.actionBtn} ${shared.actionBtnDanger}`} onClick={() => onDelete(m.id)}>删除</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {editing && !readOnly && (
        <div className={shared.riskBlock} style={{ padding: '10px 14px', borderColor: '#4F8EF7' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className={shared.formInput} value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="里程碑名称，如: M1 需求调研与评审" autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className={shared.formInput} type="date" value={editing.targetDate || ''}
                onChange={e => setEditing({ ...editing, targetDate: e.target.value })} style={{ flex: 1 }} />
              <select className={shared.formSelect} value={editing.status}
                onChange={e => setEditing({ ...editing, status: e.target.value as Milestone['status'] })} style={{ width: 110 }}>
                <option value="待开始">待开始</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
              </select>
            </div>
            <input className={shared.formInput} value={editing.description || ''}
              onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="描述，如: PRD已签字" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className={shared.btnToolbar} onClick={cancel}>取消</button>
              <button className={shared.btnPrimary} onClick={save} disabled={!editing.name.trim()}>{isNew ? '添加' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {!editing && !readOnly && (
        <button className={shared.btnDashed} onClick={add} style={{ alignSelf: 'flex-start' }}>+ 添加里程碑</button>
      )}
    </div>
  );
}

function emptyTask(projectId: string): ProjectTask {
  return { id: '', projectId, title: '', status: '待开始', priority: 'P1', assignee: '', progress: 0, sortOrder: 0 };
}

function TaskEditor({
  tasks, setTasks, projectId, onDelete, onReorder, loading, reload, toast, readOnly,
}: {
  tasks: ProjectTask[];
  setTasks: React.Dispatch<React.SetStateAction<ProjectTask[]>>;
  projectId: string;
  onDelete: (id: string) => void;
  onReorder: (tasks: ProjectTask[]) => void;
  loading: boolean;
  reload: () => Promise<void>;
  toast: (msg: string, type: 'success' | 'error') => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [isNew, setIsNew] = useState(false);

  const add = () => { setEditing({ ...emptyTask(projectId), sortOrder: tasks.length }); setIsNew(true); };
  const cancel = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    if (!editing || !editing.title.trim()) return;
    const final: ProjectTask = editing.id ? editing : { ...editing, id: genId('pt_') };
    try {
      if (!editing.id) {
        if (final.deadline) {
          let insertIdx = tasks.length;
          for (let i = 0; i < tasks.length; i++) {
            if (!tasks[i].deadline || tasks[i].deadline! > final.deadline) { insertIdx = i; break; }
          }
          final.sortOrder = insertIdx;
        } else {
          final.sortOrder = tasks.length;
        }
        await saveProjectTask(final);
        if (final.sortOrder < tasks.length) {
          await Promise.all(tasks.slice(final.sortOrder).map((t, i) => saveProjectTask({ ...t, sortOrder: final.sortOrder + i + 1 })));
        }
      } else {
        await saveProjectTask(final);
      }
      await reload();
      setEditing(null);
      setIsNew(false);
      toast('任务已保存', 'success');
    } catch {
      toast('保存失败', 'error');
    }
  };

  const reorder = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tasks.length) return;
    const list = tasks.map((t, i) => {
      if (i === index) return { ...t, sortOrder: target };
      if (i === target) return { ...t, sortOrder: index };
      return { ...t, sortOrder: i };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
    setTasks(list);
    onReorder(list);
  };

  if (loading) return <div className={shared.emptyState}>加载中...</div>;

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      '待开始': { bg: '#f0f2f7', color: '#6b7a93' },
      '进行中': { bg: '#E1F5EE', color: '#0F6E56' },
      '已完成': { bg: '#EAF3DE', color: '#3B6D11' },
      '有风险': { bg: '#FAEEDA', color: '#854F0B' },
    };
    const s = map[status] || map['待开始'];
    return <span className={shared.badge} style={{ fontSize: 10, padding: '1px 6px', background: s.bg, color: s.color }}>{status}</span>;
  };
  const priorityBadge = (p: string) => (
    <span className={shared.badge} style={{
      fontSize: 10, padding: '1px 6px',
      background: p === 'P0' ? '#FCEBEB' : p === 'P1' ? '#FAEEDA' : '#f0f2f7',
      color: p === 'P0' ? '#A32D2D' : p === 'P1' ? '#854F0B' : '#6b7a93',
    }}>{p}</span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.length === 0 && !editing && (
        <div className={shared.emptyState} style={{ padding: '20px 0' }}>暂无任务，点击下方按钮添加</div>
      )}

      {tasks.map((t, i) => (
        <div key={t.id} className={shared.riskBlock} style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {!readOnly && (
              <ReorderButtons onUp={() => reorder(i, -1)} onDown={() => reorder(i, 1)} disabledUp={i === 0} disabledDown={i === tasks.length - 1} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{t.title}</span>
                {statusBadge(t.status)}
                {priorityBadge(t.priority)}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b7a93' }}>
                {t.assignee && <span>负责人: {t.assignee}</span>}
                {t.startDate && <span>开始: {t.startDate}</span>}
                {t.deadline && <span>截止: {t.deadline}</span>}
                <span>进度: {t.progress}%</span>
              </div>
              <div style={{ marginTop: 4, height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${t.progress}%`, height: '100%',
                  background: t.status === '有风险' ? '#D85A30' : t.status === '已完成' ? '#639922' : '#378ADD',
                  borderRadius: 2, transition: 'width 0.3s',
                }} />
              </div>
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className={shared.actionBtn} onClick={() => { setEditing({ ...t }); setIsNew(false); }}>编辑</button>
                <button className={`${shared.actionBtn} ${shared.actionBtnDanger}`} onClick={() => onDelete(t.id)}>删除</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {editing && !readOnly && (
        <div className={shared.riskBlock} style={{ padding: '12px 14px', borderColor: '#4F8EF7' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className={shared.formInput} value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              placeholder="任务名称，如: 用户权限模块重构" autoFocus />
            <div style={{ display: 'flex', gap: 8 }}>
              <select className={shared.formSelect} value={editing.status}
                onChange={e => setEditing({ ...editing, status: e.target.value as ProjectTask['status'] })} style={{ flex: 1 }}>
                <option value="待开始">待开始</option>
                <option value="进行中">进行中</option>
                <option value="已完成">已完成</option>
                <option value="有风险">有风险</option>
              </select>
              <select className={shared.formSelect} value={editing.priority}
                onChange={e => setEditing({ ...editing, priority: e.target.value as ProjectTask['priority'] })} style={{ width: 80 }}>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className={shared.formInput} value={editing.assignee}
                onChange={e => setEditing({ ...editing, assignee: e.target.value })}
                placeholder="负责人" style={{ flex: 1 }} />
              <input className={shared.formInput} type="date" value={editing.startDate || ''}
                onChange={e => setEditing({ ...editing, startDate: e.target.value })} style={{ flex: 1 }} />
              <input className={shared.formInput} type="date" value={editing.deadline || ''}
                onChange={e => setEditing({ ...editing, deadline: e.target.value })} style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#6b7a93', whiteSpace: 'nowrap' }}>进度: {editing.progress}%</span>
              <input type="range" min={0} max={100} value={editing.progress}
                onChange={e => setEditing({ ...editing, progress: Number(e.target.value) })}
                style={{ flex: 1, height: 4, accentColor: '#4F8EF7' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className={shared.btnToolbar} onClick={cancel}>取消</button>
              <button className={shared.btnPrimary} onClick={save} disabled={!editing.title.trim()}>{isNew ? '添加' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {!editing && !readOnly && (
        <button className={shared.btnDashed} onClick={add} style={{ alignSelf: 'flex-start' }}>+ 添加任务</button>
      )}
    </div>
  );
}
