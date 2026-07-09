import { getProjects, getAllReports } from '../api/db';
import { filterVisibleProjects } from '../utils/helpers';
import type { Project, WeeklyReport } from '../types';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

export default function Trends() {
  const { userId, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);
  const [loading, setLoading] = useState(true);

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

  const sortedWeekLabels = useMemo(() => {
    const set = new Set<string>();
    allReports.forEach(r => set.add(r.weekLabel));
    return [...set].sort((a, b) => {
      const na = parseInt((a.match(/\d+/) || ['0'])[0], 10);
      const nb = parseInt((b.match(/\d+/) || ['0'])[0], 10);
      return na - nb;
    });
  }, [allReports]);

  const activeRiskData = useMemo(() => {
    return sortedWeekLabels.map(label => {
      const row: Record<string, string | number> = { week: label };
      const seen = new Set<string>();
      projects.forEach(p => {
        const reportsInWeek = allReports.filter(r => r.projectId === p.id && r.weekLabel === label);
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
      return { name: parent.name, 高: seenHigh.size, 中: seenMid.size, 低: seenLow.size, color: parent.color };
    });
  }, [projects, allReports]);

  const levelColors = { '高': '#ff6b6b', '中': '#ffb347', '低': '#4ADE80' };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-secondary)' }}>加载中...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className={shared.pageWrap}>
        <main className={shared.main}>
          <div className={shared.emptyState} style={{ padding: 60 }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>暂无项目</p>
            <p className={shared.textSmall}>请先在仪表盘中添加项目</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={shared.pageWrap}>
      <main className={shared.main}>
        <div className={shared.section}>
          <h3 className={shared.sectionTitle}>活跃风险数量趋势</h3>
          {activeRiskData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={activeRiskData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip formatter={(value) => [`${value} 项`, '活跃风险数']} labelFormatter={(label) => `周次：${label}`} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="活跃风险数" stroke="#ff6b6b" strokeWidth={3} dot={{ r: 4, fill: '#ff6b6b' }} activeDot={{ r: 6 }} connectNulls name="活跃风险数" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={shared.emptyState}>暂无风险数据</div>
          )}
        </div>

        <div className={shared.section}>
          <h3 className={shared.sectionTitle}>累计风险等级分布</h3>
          {riskLevelData.some(d => d.高 + d.中 + d.低 > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={riskLevelData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip formatter={(value, name) => [`${value} 项`, name]} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="高" stackId="a" fill={levelColors['高']} name="高风险" />
                <Bar dataKey="中" stackId="a" fill={levelColors['中']} name="中风险" />
                <Bar dataKey="低" stackId="a" fill={levelColors['低']} name="低风险" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={shared.emptyState} style={{ padding: 30, fontSize: 13 }}>所有项目均无风险记录</div>
          )}
        </div>
      </main>
    </div>
  );
}
