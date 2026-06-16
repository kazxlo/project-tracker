import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, getReport, getLatestReport, saveReport, generateWeekLabel } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { WeeklyReport, ReportItem, Risk } from '../types';
import shared from '../styles/shared.module.css';

/** 上一周计划确认项 */
interface PlanConfirmItem {
  item: ReportItem;
  done: boolean;
  reason: string;
}

/** 上一周风险确认项 */
interface RiskConfirmItem {
  risk: Risk;
  stillRisk: boolean;   // 是否仍属于风险
}

export default function ReportEdit() {
  const { id: projectId, reportId } = useParams<{ id: string; reportId: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isEdit = !!reportId;
  const isP1 = projectId === 'p1';
  const isPublic = role === 'public';

  // public 用户不允许新建周报
  if (isPublic && !reportId) {
    navigate(`/project/${projectId}`, { replace: true });
    return null;
  }

  // public 用户查看周报时为只读模式
  const readOnly = isPublic;

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
  const [pageLoading, setPageLoading] = useState(true);

  // 上一周计划完成确认（仅新建时）
  const [planConfirm, setPlanConfirm] = useState<PlanConfirmItem[]>([]);

  // 上一周风险确认（仅新建时）
  const [riskConfirm, setRiskConfirm] = useState<RiskConfirmItem[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function load() {
      try {
        const project = await getProject(projectId!);
        if (!cancelled) {
          if (!project) { navigate('/'); return; }
        }

        if (isEdit && reportId) {
          const existing = await getReport(reportId);
          if (!cancelled && existing) {
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
          if (!cancelled) {
            setWeekStart(start);
            setWeekEnd(end);
          }

          const prev = await getLatestReport(projectId!);
          if (!cancelled) {
            // 期数递增：从上一期的 weekLabel 解析数字 +1
            let nextWeekLabel = '';
            if (prev) {
              const match = prev.weekLabel.match(/第(\d+)周/);
              if (match) {
                nextWeekLabel = `第${parseInt(match[1], 10) + 1}周`;
              }
            }
            if (!nextWeekLabel) {
              nextWeekLabel = generateWeekLabel(start);
            }
            setWeekLabel(nextWeekLabel);
          }

          if (!cancelled && prev) {
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

            // 上周风险确认（仅带入未解决的）
            if (prev.risks.length > 0) {
              setRiskConfirm(prev.risks.map(r => ({
                risk: { ...r, id: 'rc_' + Date.now() + '_' + r.order },
                stillRisk: r.status !== '已解决',
              })));
            }

            if (prev.plannedItems.length > 0) {
              setPlanConfirm(prev.plannedItems.map(p => ({
                item: { ...p, id: 'pc_' + Date.now() + '_' + p.order },
                done: false,
                reason: '',
              })));
            }
          }
        }
      } catch (err) {
        console.error('加载周报数据失败:', err);
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId, reportId, isEdit, navigate]);

  // 计划确认：切换完成状态
  const togglePlanDone = (id: string) => {
    setPlanConfirm(prev => prev.map(pc => pc.item.id === id ? { ...pc, done: !pc.done, reason: '' } : pc));
  };

  const setPlanReason = (id: string, reason: string) => {
    setPlanConfirm(prev => prev.map(pc => pc.item.id === id ? { ...pc, reason } : pc));
  };

  const confirmCompletedPlans = () => {
    const doneItems = planConfirm.filter(pc => pc.done).map((pc, idx) => ({
      ...pc.item,
      id: 'c_pl_' + Date.now() + '_' + idx,
      order: completed.length + idx + 1,
      carriedForward: true, // 标记为从上周带入的已完成事项
    }));
    setCompleted(prev => [...prev, ...doneItems]);

    // 未完成的计划事项带入本周计划，附上未完成原因
    const undoneItems = planConfirm.filter(pc => !pc.done).map((pc, idx) => ({
      ...pc.item,
      id: 'p_undone_' + Date.now() + '_' + idx,
      order: planned.length + idx + 1,
      reason: pc.reason || '', // 保留未完成原因
    }));
    setPlanned(prev => [...undoneItems, ...prev]);

    setPlanConfirm([]);
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

  // 风险确认：切换是否仍属于风险
  const toggleRiskStillRisk = (id: string) => {
    setRiskConfirm(prev => prev.map(rc => rc.risk.id === id ? { ...rc, stillRisk: !rc.stillRisk } : rc));
  };

  const confirmRisks = () => {
    // 仍属于风险的项目带入本周风险
    const stillRisks = riskConfirm.filter(rc => rc.stillRisk).map((rc, idx) => ({
      ...rc.risk,
      id: 'r_cf_' + Date.now() + '_' + idx,
      order: risks.length + idx + 1,
      status: rc.risk.status === '已解决' ? '持续关注' as const : rc.risk.status,
    }));
    setRisks(prev => [...stillRisks, ...prev]);

    // 已不属于风险的项目：加入本周风险列表，标记为已解决并记录处理时间
    const resolvedRisks = riskConfirm.filter(rc => !rc.stillRisk).map((rc, idx) => ({
      ...rc.risk,
      id: 'r_res_' + Date.now() + '_' + idx,
      order: risks.length + stillRisks.length + idx + 1,
      status: '已解决' as const,
      resolvedAt: new Date().toISOString(),
    }));
    setRisks(prev => [...prev, ...resolvedRisks]);

    setRiskConfirm([]);
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
  const handleSubmit = async () => {
    if (!projectId || saving) return;
    setSaving(true);
    try {
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
      await saveReport(report);
      navigate(`/project/${projectId}`);
    } catch (err) {
      console.error('保存周报失败:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#6b7a93' }}>
        加载中...
      </div>
    );
  }

  return (
    <div className={shared.editorWrap}>
      <span className={shared.backLink} onClick={() => navigate(`/project/${projectId}`)}>
        ← 返回项目详情
      </span>
      <h2 className={shared.pageTitle}>{readOnly ? '查看周报' : isEdit ? '编辑周报' : '新建周报'}</h2>

      <div className={shared.formRow}>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>周次标签</label>
          <input
            className={shared.formInput}
            value={weekLabel}
            onChange={e => setWeekLabel(e.target.value)}
            placeholder="如: 第12周"
            readOnly={readOnly}
          />
        </div>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>开始日期</label>
          <input
            className={shared.formInput}
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            readOnly={readOnly}
          />
        </div>
        <div className={shared.formGroup}>
          <label className={shared.formLabel}>结束日期</label>
          <input
            className={shared.formInput}
            type="date"
            value={weekEnd}
            onChange={e => setWeekEnd(e.target.value)}
            readOnly={readOnly}
          />
        </div>
      </div>

      {/* 上一周计划确认区（仅新建时且有上一周计划） */}
      {!isEdit && planConfirm.length > 0 && (
        <div className={shared.section} style={{ border: '1px solid #4F8EF7', background: '#f0f5ff' }}>
          <h3 className={shared.sectionTitle} style={{ color: '#4F8EF7' }}>
            上一周计划事项完成确认
          </h3>
          <p className={shared.textSmall} style={{ color: '#6b7a93', marginBottom: 12 }}>
            请确认上一周计划的事项哪些已完成（将自动纳入本周完成事项），未完成的将自动带入本周计划事项并附上未完成原因。
          </p>
          {planConfirm.map(pc => (
            <div key={pc.item.id} className={shared.planConfirmRow}>
              <label className={shared.checkLabel}>
                <input
                  type="checkbox"
                  checked={pc.done}
                  onChange={() => togglePlanDone(pc.item.id)}
                />
                <span style={{ marginLeft: 8, fontSize: 13, textDecoration: pc.done ? 'line-through' : 'none', color: pc.done ? '#6b7a93' : '#1c2a44' }}>
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
          >
            ✓ 确认并继续填写周报
          </button>
        </div>
      )}

      {/* 上一周风险确认区（仅新建时且有上一周风险） */}
      {!isEdit && riskConfirm.length > 0 && (
        <div className={shared.section} style={{ border: '1px solid #FB923C', background: '#fff8f0' }}>
          <h3 className={shared.sectionTitle} style={{ color: '#FB923C' }}>
            上一周风险确认
          </h3>
          <p className={shared.textSmall} style={{ color: '#6b7a93', marginBottom: 12 }}>
            请确认上一周的风险事项是否仍属于风险。已不属于风险的将标记为"已解决"并记录处理时间。
          </p>
          {riskConfirm.map(rc => (
            <div key={rc.risk.id} className={shared.planConfirmRow}>
              <label className={shared.checkLabel}>
                <input
                  type="checkbox"
                  checked={rc.stillRisk}
                  onChange={() => toggleRiskStillRisk(rc.risk.id)}
                />
                <span style={{ marginLeft: 8, fontSize: 13, textDecoration: rc.stillRisk ? 'none' : 'line-through', color: rc.stillRisk ? '#1c2a44' : '#6b7a93' }}>
                  [{rc.risk.level}] {rc.risk.description || '(空描述)'}
                </span>
              </label>
              {!rc.stillRisk && (
                <span style={{ fontSize: 12, color: '#4ADE80', marginLeft: 12 }}>✓ 将标记为已解决</span>
              )}
            </div>
          ))}
          <button
            className={shared.btnDashedDanger}
            onClick={confirmRisks}
            style={{ marginTop: 12 }}
          >
            ✓ 确认风险状态并继续
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
          readOnly={readOnly}
        />
      </Section>

      <Section title="重点内容">
        <textarea
          className={shared.formTextarea}
          value={highlights}
          onChange={e => setHighlights(e.target.value)}
          placeholder="输入本周重点工作内容..."
          rows={3}
          readOnly={readOnly}
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
              disabled={readOnly}
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
                readOnly={readOnly}
              />
              {!readOnly && (
                <button className={shared.delBtn} onClick={() => removeItem(completed, setCompleted, item.id)} title="删除">×</button>
              )}
            </div>
            {isP1 && (
              <div style={{ display: 'flex', gap: 8, paddingLeft: 20, marginBottom: completed.indexOf(item) === completed.length - 1 ? 0 : 4 }}>
                <input
                  className={shared.formInput}
                  value={item.progress || ''}
                  onChange={e => updateItemField(completed, setCompleted, item.id, 'progress', e.target.value)}
                  placeholder="子项目进展"
                  style={{ flex: 1, fontSize: 12 }}
                  readOnly={readOnly}
                />
                <input
                  className={shared.formInput}
                  value={item.acceptance || ''}
                  onChange={e => updateItemField(completed, setCompleted, item.id, 'acceptance', e.target.value)}
                  placeholder="验收资料进展"
                  style={{ flex: 1, fontSize: 12 }}
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>
        ))}
        {!readOnly && (
          <button className={shared.btnDashed} onClick={() => addItem(completed, setCompleted, 'c')} style={{ marginTop: 8 }}>
            + 添加事项
          </button>
        )}
      </Section>

      {/* 下周工作计划 */}
      <Section title="下周工作计划">
        {planned.map((item) => (
          <div key={item.id}>
            <div className={shared.inlineRow}>
              <span className={shared.orderNum}>{item.order}.</span>
              <input
                className={shared.formInput}
                value={item.title}
                onChange={e => updateItemField(planned, setPlanned, item.id, 'title', e.target.value)}
                placeholder={`计划事项 ${item.order}`}
                style={{ flex: 1 }}
                readOnly={readOnly}
              />
              {!readOnly && (
                <button className={shared.delBtn} onClick={() => removeItem(planned, setPlanned, item.id)}>×</button>
              )}
            </div>
            {item.reason !== undefined && (
              <div style={{ paddingLeft: 24, marginBottom: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#FB923C', whiteSpace: 'nowrap' }}>📎 上周未完成原因：</span>
                <input
                  className={shared.formInput}
                  value={item.reason}
                  onChange={e => updateItemField(planned, setPlanned, item.id, 'reason', e.target.value)}
                  placeholder="未完成原因..."
                  style={{ flex: 1, fontSize: 12, color: '#FB923C' }}
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>
        ))}
        {!readOnly && (
          <button className={shared.btnDashed} onClick={() => addItem(planned, setPlanned, 'p')} style={{ marginTop: 4 }}>
            + 添加计划
          </button>
        )}
      </Section>

      {/* 风险提示 */}
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
                disabled={readOnly}
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
              <select
                className={shared.formSelect}
                value={risk.status}
                onChange={e => updateRisk(risk.id, 'status', e.target.value)}
                disabled={readOnly}
              >
                <option value="待处理">待处理</option>
                <option value="已解决">已解决</option>
                <option value="持续关注">持续关注</option>
              </select>
              {!readOnly && (
                <button className={shared.delBtn} onClick={() => removeRisk(risk.id)}>×</button>
              )}
            </div>
            <input
              className={shared.formInput}
              value={risk.description}
              onChange={e => updateRisk(risk.id, 'description', e.target.value)}
              placeholder="风险描述"
              style={{ marginBottom: 6 }}
              readOnly={readOnly}
            />
            <input
              className={shared.formInput}
              value={risk.suggestion || ''}
              onChange={e => updateRisk(risk.id, 'suggestion', e.target.value)}
              placeholder="解决建议"
              style={{ fontSize: 12, color: '#6b7a93' }}
              readOnly={readOnly}
            />
          </div>
        ))}
        {!readOnly && (
          <button className={shared.btnDashedDanger} onClick={addRisk} style={{ marginTop: 8 }}>
            + 添加风险
          </button>
        )}
      </Section>

      <div className={shared.editorFooter}>
        <button className={shared.btnOutline} onClick={() => navigate(`/project/${projectId}`)}>
          {readOnly ? '返回' : '取消'}
        </button>
        {!readOnly && (
          <button className={shared.btnPrimaryLg} onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存周报'}
          </button>
        )}
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
