import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, getReport, getLatestReport, saveReport, generateWeekLabel } from '../api/storage';
import { WeeklyReport, ReportItem, Risk } from '../types';
import shared from '../styles/shared.module.css';

/** 上一周计划确认项 */
interface PlanConfirmItem {
  item: ReportItem;
  done: boolean;
  reason: string;
}

export default function ReportEdit() {
  const { id: projectId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const isEdit = !!reportId;
  // 仅"在建项目验收管理"使用三字段结构
  const isP1 = projectId === 'p1';

  const getWeekRange = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    return { start: fmt(monday), end: fmt(friday) };
  };

  const [goals, setGoals] = useState('');
  const [highlights, setHighlights] = useState('');
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState<ReportItem[]>([]);
  const [planned, setPlanned] = useState<ReportItem[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [weekLabel, setWeekLabel] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [savedCreatedAt, setSavedCreatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 上一周计划完成确认（仅新建时）
  const [planConfirm, setPlanConfirm] = useState<PlanConfirmItem[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const project = getProject(projectId);
    if (!project) { navigate('/'); return; }

    if (isEdit && reportId) {
      const existing = getReport(reportId);
      if (existing) {
        setGoals(existing.goals || existing.summary || '');
        setHighlights(existing.highlights || '');
        setProgress(existing.progress || 0);
        setCompleted(existing.completedItems.length > 0 ? existing.completedItems : []);
        setPlanned(existing.plannedItems.length > 0 ? existing.plannedItems : []);
        setRisks(existing.risks);
        setWeekLabel(existing.weekLabel);
        setWeekStart(existing.weekStart);
        setWeekEnd(existing.weekEnd);
        setSavedCreatedAt(existing.createdAt);
      }
    } else {
      const { start, end } = getWeekRange();
      setWeekStart(start);
      setWeekEnd(end);
      setWeekLabel(generateWeekLabel(start));

      const prev = getLatestReport(projectId);
      if (prev) {
        setGoals(prev.goals || prev.summary || '');
        setHighlights(prev.highlights || '');
        setProgress(prev.progress || 0);
        setCompleted(prev.completedItems.length > 0
          ? prev.completedItems.map(c => ({ ...c, id: 'c_' + Date.now() + '_' + c.order }))
          : []);
        setPlanned(prev.plannedItems.length > 0
          ? prev.plannedItems.map(p => ({ ...p, id: 'p_' + Date.now() + '_' + p.order }))
          : []);
        setRisks(prev.risks.length > 0
          ? prev.risks.map(r => ({ ...r, id: 'r_' + Date.now() + '_' + r.order, status: r.status === '已解决' ? '持续关注' as const : r.status }))
          : []);

        // 上一周计划事项完成确认：列出上一周 plannedItems，供用户勾选完成/未完成
        if (prev.plannedItems.length > 0) {
          setPlanConfirm(prev.plannedItems.map(p => ({
            item: { ...p, id: 'pc_' + Date.now() + '_' + p.order }, // 新 id
            done: false,
            reason: '',
          })));
        }
      }
    }
  }, [projectId, reportId, isEdit, navigate]);

  // 计划确认：切换完成状态
  const togglePlanDone = (id: string) => {
    setPlanConfirm(prev => prev.map(pc => pc.item.id === id ? { ...pc, done: !pc.done, reason: '' } : pc));
  };

  const setPlanReason = (id: string, reason: string) => {
    setPlanConfirm(prev => prev.map(pc => pc.item.id === id ? { ...pc, reason } : pc));
  };

  // 将已确认完成的计划事项一键移入本周完成事项
  const confirmCompletedPlans = () => {
    const doneItems = planConfirm.filter(pc => pc.done).map((pc, idx) => ({
      ...pc.item,
      id: 'c_pl_' + Date.now() + '_' + idx,
      order: completed.length + idx + 1,
    }));
    setCompleted(prev => [...prev, ...doneItems]);
    setPlanConfirm(prev => prev.filter(pc => !pc.done));
  };

  // --- 事项操作 ---
  const addItem = (list: ReportItem[], setter: (v: ReportItem[]) => void, prefix: string) => {
    setter([...list, { id: prefix + Date.now(), order: list.length + 1, title: '' }]);
  };

  const removeItem = (list: ReportItem[], setter: (v: ReportItem[]) => void, id: string) => {
    setter(list.filter(i => i.id !== id).map((i, idx) => ({ ...i, order: idx + 1 })));
  };

  const updateItemField = (list: ReportItem[], setter: (v: ReportItem[]) => void, id: string, field: string, value: string) => {
    setter(list.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // --- 风险操作 ---
  const addRisk = () => {
    setRisks([...risks, { id: 'r' + Date.now(), order: risks.length + 1, description: '', suggestion: '', level: '中', status: '待处理' }]);
  };

  const removeRisk = (id: string) => {
    setRisks(risks.filter(r => r.id !== id).map((r, idx) => ({ ...r, order: idx + 1 })));
  };

  const updateRisk = (id: string, field: string, value: string) => {
    setRisks(risks.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // --- 提交 ---
  const handleSubmit = () => {
    if (!projectId || saving) return;
    setSaving(true);
    const filteredCompleted = completed.filter(i => i.title.trim());
    const filteredPlanned = planned.filter(i => i.title.trim());
    const filteredRisks = risks.filter(r => r.description.trim());

    const report: WeeklyReport = {
      id: isEdit && reportId ? reportId : 'wr_' + Date.now(),
      projectId,
      weekLabel: weekLabel || generateWeekLabel(weekStart),
      weekStart,
      weekEnd,
      createdAt: savedCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      goals,
      highlights,
      progress,
      completedItems: filteredCompleted,
      plannedItems: filteredPlanned,
      risks: filteredRisks,
    };
    saveReport(report);
    navigate(`/project/${projectId}`);
  };

  return (
    <div className={shared.editorWrap}>
      <span className={shared.backLink} onClick={() => navigate(`/project/${projectId}`)}>
        ← 返回项目详情
      </span>
      <h2 className={shared.pageTitle}>{isEdit ? '编辑周报' : '新建周报'}</h2>

      <div className={shared.formRow}>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>周次标签</label>
          <input
            className={shared.formInput}
            value={weekLabel}
            onChange={e => setWeekLabel(e.target.value)}
            placeholder="如: 第12周"
          />
        </div>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>开始日期</label>
          <input
            className={shared.formInput}
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
          />
        </div>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>结束日期</label>
          <input
            className={shared.formInput}
            type="date"
            value={weekEnd}
            onChange={e => setWeekEnd(e.target.value)}
          />
        </div>
      </div>

      {/* 上一周计划确认区（仅新建时且有上一周计划） */}
      {!isEdit && planConfirm.length > 0 && (
        <div className={shared.section} style={{ border: '1px solid #378ADD', background: '#f5faff' }}>
          <h3 className={shared.sectionTitle} style={{ color: '#378ADD' }}>
            上一周计划事项完成确认
          </h3>
          <p className={shared.textSmall} style={{ color: '#666', marginBottom: 12 }}>
            请确认上一周计划的事项哪些已完成（将自动纳入本周完成事项），未完成的请说明原因。
          </p>
          {planConfirm.map(pc => (
            <div key={pc.item.id} className={shared.planConfirmRow}>
              <label className={shared.checkLabel}>
                <input
                  type="checkbox"
                  checked={pc.done}
                  onChange={() => togglePlanDone(pc.item.id)}
                />
                <span style={{ marginLeft: 8, fontSize: 13, textDecoration: pc.done ? 'line-through' : 'none', color: pc.done ? '#999' : '#333' }}>
                  {pc.item.title || '(空标题)'}
                </span>
              </label>
              {!pc.done && (
                <input
                  className={shared.formInput}
                  value={pc.reason}
                  onChange={e => setPlanReason(pc.item.id, e.target.value)}
                  placeholder="未完成原因..."
                  style={{ flex: 1, fontSize: 12, marginLeft: 24 }}
                />
              )}
            </div>
          ))}
          <button
            className={shared.btnDashed}
            onClick={confirmCompletedPlans}
            style={{ marginTop: 12 }}
            disabled={!planConfirm.some(pc => pc.done)}
          >
            ✓ 将已完成项移入本周完成事项
          </button>
        </div>
      )}

      <Section title="建设目标">
        <textarea
          className={shared.formTextarea}
          value={goals}
          onChange={e => setGoals(e.target.value)}
          placeholder="输入本周建设目标..."
          rows={3}
        />
      </Section>

      <Section title="重点内容">
        <textarea
          className={shared.formTextarea}
          value={highlights}
          onChange={e => setHighlights(e.target.value)}
          placeholder="输入本周重点工作内容..."
          rows={3}
        />
      </Section>

      <Section title="当前完成进度">
        <div className={shared.progressRow} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          <div className={shared.progressInput}>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={progress}
              onChange={e => setProgress(Number(e.target.value))}
            />
            <span className={shared.progressValue}>{progress}%</span>
          </div>
        </div>
      </Section>

      {/* 本周工作完成情况 */}
      <Section title="本周工作完成情况">
        {completed.map((item) => (
          <div key={item.id} className={isP1 ? shared.completedItemBlock : ''}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isP1 ? 6 : 0 }}>
              <span className={shared.orderNum}>{item.order}.</span>
              <input
                className={shared.formInput}
                value={item.title}
                onChange={e => updateItemField(completed, setCompleted, item.id, 'title', e.target.value)}
                placeholder={isP1 ? '子项目名称' : `完成事项 ${item.order}`}
                style={{ flex: 1, fontWeight: isP1 ? 500 : 400 }}
              />
              <button className={shared.delBtn} onClick={() => removeItem(completed, setCompleted, item.id)} title="删除">×</button>
            </div>
            {/* 仅 p1 显示三字段子行 */}
            {isP1 && (
              <div style={{ display: 'flex', gap: 8, paddingLeft: 20, marginBottom: completed.indexOf(item) === completed.length - 1 ? 0 : 4 }}>
                <input
                  className={shared.formInput}
                  value={item.progress || ''}
                  onChange={e => updateItemField(completed, setCompleted, item.id, 'progress', e.target.value)}
                  placeholder="子项目进展"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <input
                  className={shared.formInput}
                  value={item.acceptance || ''}
                  onChange={e => updateItemField(completed, setCompleted, item.id, 'acceptance', e.target.value)}
                  placeholder="验收资料进展"
                  style={{ flex: 1, fontSize: 12 }}
                />
              </div>
            )}
          </div>
        ))}
        <button className={shared.btnDashed} onClick={() => addItem(completed, setCompleted, 'c')} style={{ marginTop: 8 }}>
          + 添加事项
        </button>
      </Section>

      {/* 下周工作计划 */}
      <Section title="下周工作计划">
        {planned.map((item) => (
          <div key={item.id} className={shared.inlineRow}>
            <span className={shared.orderNum}>{item.order}.</span>
            <input
              className={shared.formInput}
              value={item.title}
              onChange={e => updateItemField(planned, setPlanned, item.id, 'title', e.target.value)}
              placeholder={`计划事项 ${item.order}`}
              style={{ flex: 1 }}
            />
            <button className={shared.delBtn} onClick={() => removeItem(planned, setPlanned, item.id)}>×</button>
          </div>
        ))}
        <button className={shared.btnDashed} onClick={() => addItem(planned, setPlanned, 'p')} style={{ marginTop: 4 }}>
          + 添加计划
        </button>
      </Section>

      {/* 风险提示（改为三部分：等级＋描述＋解决建议） */}
      <Section title="风险提示">
        {risks.map((risk) => (
          <div key={risk.id} className={shared.riskBlock}>
            <div className={shared.inlineRow}>
              <span className={shared.orderNum}>{risk.order}.</span>
              <select
                className={shared.formSelect}
                value={risk.level}
                onChange={e => updateRisk(risk.id, 'level', e.target.value)}
                style={{ width: 70 }}
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
              <select
                className={shared.formSelect}
                value={risk.status}
                onChange={e => updateRisk(risk.id, 'status', e.target.value)}
              >
                <option value="待处理">待处理</option>
                <option value="已解决">已解决</option>
                <option value="持续关注">持续关注</option>
              </select>
              <button className={shared.delBtn} onClick={() => removeRisk(risk.id)}>×</button>
            </div>
            <input
              className={shared.formInput}
              value={risk.description}
              onChange={e => updateRisk(risk.id, 'description', e.target.value)}
              placeholder="风险描述"
              style={{ marginBottom: 6 }}
            />
            <input
              className={shared.formInput}
              value={risk.suggestion || ''}
              onChange={e => updateRisk(risk.id, 'suggestion', e.target.value)}
              placeholder="解决建议"
              style={{ fontSize: 12, color: '#666' }}
            />
          </div>
        ))}
        <button className={shared.btnDashedDanger} onClick={addRisk} style={{ marginTop: 8 }}>
          + 添加风险
        </button>
      </Section>

      <div className={shared.editorFooter}>
        <button className={shared.btnOutline} onClick={() => navigate(`/project/${projectId}`)}>取消</button>
        <button className={shared.btnPrimaryLg} onClick={handleSubmit} disabled={saving}>
          {saving ? '保存中...' : '保存周报'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={shared.section}>
      <h3 className={shared.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}
