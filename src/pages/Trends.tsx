import { getProjects, getAllReports } from '../api/storage';
import { Project, WeeklyReport } from '../types';
import { useState, useEffect } from 'react';
import shared from '../styles/shared.module.css';

export default function Trends() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allReports, setAllReports] = useState<WeeklyReport[]>([]);

  useEffect(() => {
    setProjects(getProjects());
    // 修复 Bug: getReports('') → getAllReports()
    setAllReports(getAllReports());
  }, []);

  const reportsByProject: Record<string, WeeklyReport[]> = {};
  projects.forEach(p => {
    reportsByProject[p.id] = allReports.filter(r => r.projectId === p.id);
  });

  return (
    <div>
      <h2 className={shared.pageTitle}>趋势分析</h2>
      <div className={shared.trendList}>
        {projects.map(p => {
          const reports = reportsByProject[p.id] || [];
          return (
            <div key={p.id} className={shared.trendCard}>
              <div className={shared.trendHeader}>
                <div className={shared.trendDot} style={{ background: p.color }}/>
                <h3 className={shared.trendTitle}>{p.name}</h3>
                <span className={shared.trendMeta}>— 周报{reports.length}期</span>
              </div>
              {reports.length === 0 ? (
                <div className={shared.emptyState} style={{ padding: 30, fontSize: 13 }}>暂无数据</div>
              ) : (
                <div className={shared.barChartAreaSm}>
                  {/* 修复：显式按 weekStart 升序排列，确保图表从旧到新 */}
                  {[...reports].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(0, 12).map((r, idx) => {
                    const h = Math.max(8, r.completedItems.length * 28);
                    return (
                      <div key={r.id} className={shared.barCol}>
                        <div className={shared.barValue} style={{ fontSize: 11, color: p.color }}>
                          {r.completedItems.length}
                        </div>
                        <div
                          className={shared.barBodySm}
                          style={{
                            height: h,
                            background: p.color,
                            opacity: 0.3 + (idx / Math.max(reports.length, 1)) * 0.7,
                          }}
                        />
                        <div className={shared.barLabel} style={{ width: 50 }}>
                          {r.weekLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className={shared.emptyState} style={{ padding: 60 }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>暂无项目</p>
          <p className={shared.textSmall}>请先在仪表盘中添加项目</p>
        </div>
      )}
    </div>
  );
}
