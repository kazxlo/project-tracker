import { getProjects, getAllReports } from '../api/db';
import { getLatestReport, filterVisibleProjects, calcOverallProgress } from '../utils/helpers';
import type { Project, WeeklyReport } from '../types';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

type TabKey = 'progress' | 'health';

export default function Trends() {
  const { userId, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('progress');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [projs, reps] = await Promise.all([getProjects(), getAllReports()]);
        if (!cancelled) {
          setProjects(filterVisibleProjects(projs, userId, role));
          setAllReports(reps);
        }
      } catch (err) {
        console.error('加载趋势数据失败:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, role]);

  // ---- 数据处理 ----

  // 收集所有唯一的周次标签（按时间排序）
  const sortedWeekLabels = useMemo(() => {
    const set = new Set<string>();
    allReports.forEach(r => set.add(r.weekLabel));
    return [...set].sort((a, b) => {
      const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
      const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
      return na - nb;
    });
  }, [allReports]);

  // 进度趋势数据：每个周次标签 → 各父项目进度（子项目合并到父项目）
  const progressData = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    return sortedWeekLabels.map(label => {
      const row: Record<string, string | number> = { week: label };
      topProjects.forEach(parent => {
        const childProjects = projects.filter(c => c.parentId === parent.id);
        const targetIds = [parent.id, ...childProjects.map(c => c.id)];
        const reportsInWeek = allReports.filter(
          r => targetIds.includes(r.projectId) && r.weekLabel === label
        );
        // 父项目进度 = 自身最新周报进度 + 各子项目最新周报进度 取均值（同一周内按 createdAt 取最新）
        const values: number[] = [];
        const pickLatest = (reps: WeeklyReport[]) =>
          reps.length > 0 ? reps.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;
        const selfLatest = pickLatest(reportsInWeek.filter(r => r.projectId === parent.id));
        if (selfLatest && selfLatest.progress > 0) values.push(selfLatest.progress);
        childProjects.forEach(child => {
          const latest = pickLatest(reportsInWeek.filter(r => r.projectId === child.id));
          if (latest && latest.progress > 0) values.push(latest.progress);
        });
        const progress = values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0;
        row[parent.name] = progress;
      });
      return row;
    });
  }, [sortedWeekLabels, projects, allReports]);

  // 活跃风险数量趋势数据：每个周次 → 所有项目活跃风险总数（待处理+持续关注，跨项目去重）
  const activeRiskData = useMemo(() => {
    return sortedWeekLabels.map(label => {
      const row: Record<string, string | number> = { week: label };
      const seen = new Set<string>();
      projects.forEach(p => {
        const reportsInWeek = allReports.filter(
          r => r.projectId === p.id && r.weekLabel === label
        );
        reportsInWeek.forEach(r => {
          r.risks.forEach(rk => {
            if (rk.status === '已解决') return;
            const key = `${p.id}::${rk.description.trim()}`;
            if (key && !seen.has(key)) seen.add(key);
          });
        });
      });
      row['活跃风险数'] = seen.size;
      return row;
    });
  }, [sortedWeekLabels, projects, allReports]);

  // 累计风险等级分布（堆叠）：每个父项目一列，子项目合并到父项目中，堆叠 高/中/低（去重）
  const riskLevelData = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    return topProjects.map(parent => {
      const childIds = projects.filter(c => c.parentId === parent.id).map(c => c.id);
      const targetIds = [parent.id, ...childIds];
      const seenHigh = new Set<string>();
      const seenMid = new Set<string>();
      const seenLow = new Set<string>();
      targetIds.forEach(pid => {
        const prpts = allReports.filter(r => r.projectId === pid);
        prpts.forEach(r => {
          r.risks.forEach(rk => {
            const key = rk.description.trim();
            if (!key || seenHigh.has(key) || seenMid.has(key) || seenLow.has(key)) return;
            if (rk.level === '高') seenHigh.add(key);
            else if (rk.level === '中') seenMid.add(key);
            else seenLow.add(key);
          });
        });
      });
      return {
        name: parent.name,
        高: seenHigh.size,
        中: seenMid.size,
        低: seenLow.size,
        color: parent.color,
      };
    });
  }, [projects, allReports]);

  // 最新进度汇总表格（子项目合并到父项目，父项目自身周报进度也纳入均值）
  const latestProgressTable = useMemo(() => {
    const topProjects = projects.filter(p => !p.parentId);
    return topProjects.map(parent => {
      const childProjects = projects.filter(c => c.parentId === parent.id);
      const targetIds = [parent.id, ...childProjects.map(c => c.id)];
      const prpts = allReports.filter(r => targetIds.includes(r.projectId));
      const latest = getLatestReport(prpts);
      const progress = calcOverallProgress(
        allReports.filter(r => r.projectId === parent.id),
        childProjects.map(c => allReports.filter(r => r.projectId === c.id))
      );
      return {
        project: parent,
        latest,
        reportCount: prpts.length,
        childCount: childProjects.length,
        progress,
      };
    });
  }, [projects, allReports]);

  // 风险等级颜色
  const levelColors = { '高': '#ff6b6b', '中': '#ffb347', '低': '#4ADE80' };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#6b7a93' }}>
        加载中...
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div>
        <h2 className={shared.pageTitle}>趋势分析</h2>
        <div className={shared.emptyState} style={{ padding: 60 }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无项目</p>
          <p className={shared.textSmall}>请先在仪表盘中添加项目</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={shared.pageTitle}>趋势分析</h2>

      {/* Tab 切换 */}
      <div className={shared.tabBar}>
        <div
          className={`${shared.tab} ${tab === 'progress' ? shared.tabActive : shared.tabInactive}`}
          onClick={() => setTab('progress')}
        >
          项目进度趋势
        </div>
        <div
          className={`${shared.tab} ${tab === 'health' ? shared.tabActive : shared.tabInactive}`}
          onClick={() => setTab('health')}
        >
          项目健康趋势
        </div>
      </div>

      {/* ===== Tab 1: 项目进度趋势 ===== */}
      {tab === 'progress' && (
        <>
          <div className={shared.section}>
            <h3 className={shared.sectionTitle}>各项目完成进度对比（%）</h3>
            {progressData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={progressData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                  <XAxis dataKey="week" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, '']}
                    labelFormatter={(label) => `周次：${label}`}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  {projects.filter(p => !p.parentId).map(p => (
                    <Line
                      key={p.id}
                      type="monotone"
                      dataKey={p.name}
                      stroke={p.color}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                      connectNulls
                      name={p.name}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={shared.emptyState}>暂无周报数据</div>
            )}
          </div>

          {/* 最新进度汇总表格 */}
          <div className={shared.section}>
            <h3 className={shared.sectionTitle}>最新一期进度汇总</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e0e5ec' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7a93', fontWeight: 400, fontSize: 12 }}>项目</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7a93', fontWeight: 400, fontSize: 12 }}>负责人</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7a93', fontWeight: 400, fontSize: 12 }}>最新周次</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7a93', fontWeight: 400, fontSize: 12 }}>完成进度</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7a93', fontWeight: 400, fontSize: 12 }}>周报期数</th>
                </tr>
              </thead>
              <tbody>
                {latestProgressTable.map(({ project, latest, reportCount, childCount, progress }) => {
                  return (
                    <tr key={project.id} style={{ borderBottom: '1px solid #f0f2f7' }}>
                      <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: project.color, display: 'inline-block' }} />
                        <span style={{ fontWeight: 500 }}>{project.name}</span>
                        {childCount > 0 && (
                          <span style={{ fontSize: 11, color: '#6b7a93' }}>(含{childCount}个子项目)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#6b7a93' }}>{project.owner}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7a93' }}>
                        {latest ? latest.weekLabel : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 500,
                          color: project.color,
                          fontSize: 15,
                        }}>
                          {latest ? `${progress}%` : '—'}
                        </span>
                        {childCount > 0 && latest && (
                          <span style={{ fontSize: 11, color: '#6b7a93', marginLeft: 4 }}>(子项目均值)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#6b7a93' }}>
                        {reportCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== Tab 2: 项目健康趋势 ===== */}
      {tab === 'health' && (
        <>
          {/* 图表A：活跃风险数量趋势 */}
          <div className={shared.section}>
            <h3 className={shared.sectionTitle}>活跃风险数量趋势</h3>
            {activeRiskData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={activeRiskData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                  <XAxis dataKey="week" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip
                    formatter={(value) => [`${value} 项`, '活跃风险数']}
                    labelFormatter={(label) => `周次：${label}`}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="活跃风险数"
                    stroke="#ff6b6b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#ff6b6b' }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    name="活跃风险数"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={shared.emptyState}>暂无风险数据</div>
            )}
          </div>

          {/* 图表B：风险等级分布（堆叠柱状图） */}
          <div className={shared.section}>
            <h3 className={shared.sectionTitle}>累计风险等级分布</h3>
            {riskLevelData.some(d => d.高 + d.中 + d.低 > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={riskLevelData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip
                    formatter={(value, name) => [`${value} 项`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="高" stackId="a" fill={levelColors['高']} name="高风险" />
                  <Bar dataKey="中" stackId="a" fill={levelColors['中']} name="中风险" />
                  <Bar dataKey="低" stackId="a" fill={levelColors['低']} name="低风险" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className={shared.emptyState} style={{ padding: 30, fontSize: 13 }}>
                所有项目均无风险记录
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
