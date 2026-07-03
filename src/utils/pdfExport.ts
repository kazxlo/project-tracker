/**
 * PDF 导出工具 — 生成本周汇总报告并通过浏览器打印为 PDF
 */
import type { Project, WeeklyReport, Risk } from '../types';
import { getLatestReport, formatDateChinese, RISK_LEVEL_ORDER } from './helpers';

interface ProjectReport {
  project: Project;
  latestReport: WeeklyReport | null;
  childReports?: { project: Project; latestReport: WeeklyReport | null }[];
  isParentWithChildren: boolean;
}

/** HTML 转义，防止 PDF 导出时的 XSS 注入攻击 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 收集项目所有周报中待处理+持续关注的风险，区分本周新增与历史风险。
 * 返回 { newThisWeek, historical }，均按 level 排序。
 */
function collectProjectUnresolvedRisks(projectId: string, allReports: WeeklyReport[]) {
  const prpts = allReports
    .filter(r => r.projectId === projectId)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  if (prpts.length === 0) return { newThisWeek: [] as Risk[], historical: [] as Risk[] };

  const latest = prpts[prpts.length - 1];
  const latestStart = latest.weekStart;
  const earlier = prpts.slice(0, -1);

  // 历史风险描述集合
  const historicalKeys = new Set<string>();
  earlier.forEach(r => {
    r.risks.forEach(rk => {
      if (rk.status !== '已解决') {
        const k = rk.description.trim();
        if (k) historicalKeys.add(k);
      }
    });
  });

  const newThisWeek: Risk[] = [];
  const historical: Risk[] = [];
  const seen = new Set<string>();

  // 遍历所有周报（最早→最新），去重收集未解决风险
  prpts.forEach(r => {
    r.risks.forEach(rk => {
      if (rk.status === '已解决') return;
      const k = rk.description.trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      if (r.weekStart === latestStart && !historicalKeys.has(k)) {
        newThisWeek.push(rk);
      } else {
        historical.push(rk);
      }
    });
  });

  // 按等级排序
  const sortByLevel = (a: Risk, b: Risk) =>
    (RISK_LEVEL_ORDER[a.level] ?? 9) - (RISK_LEVEL_ORDER[b.level] ?? 9);
  newThisWeek.sort(sortByLevel);
  historical.sort(sortByLevel);

  return { newThisWeek, historical };
}

export function exportWeeklySummaryPDF(projects: Project[], allReports: WeeklyReport[]) {
  // 1. 构建父子关系映射
  const childByParent = new Map<string, Project[]>();
  projects.forEach(p => {
    if (p.parentId) {
      if (!childByParent.has(p.parentId)) childByParent.set(p.parentId, []);
      childByParent.get(p.parentId)!.push(p);
    }
  });

  // 2. 收集所有高风险（待处理+持续关注）（来自所有选中项目含子项目，去重并排序）
  const childProjectIds = new Set<string>();
  projects.forEach(p => {
    if (p.parentId && projects.some(pp => pp.id === p.parentId)) {
      childProjectIds.add(p.id);
    }
  });
  const riskMap = new Map<string, { projectName: string; color: string; risk: Risk }>();
  projects.forEach(p => {
    const prpts = allReports.filter(r => r.projectId === p.id);
    const latest = getLatestReport(prpts);
    if (!latest) return;
    latest.risks.forEach(rk => {
      if (rk.status === '已解决') return;
      if (rk.level !== '高') return;
      const key = rk.description.trim();
      if (key && !riskMap.has(key)) {
        riskMap.set(key, { projectName: p.name, color: p.color, risk: rk });
      }
    });
  });
  const allUnresolvedRisks = Array.from(riskMap.values()).sort((a, b) =>
    (RISK_LEVEL_ORDER[a.risk.level] ?? 9) - (RISK_LEVEL_ORDER[b.risk.level] ?? 9)
  );

  // 3. 构建项目报告列表（父项目聚合子项目数据，单独子项目跳过展示）
  const displayProjects = projects.filter(p => !childProjectIds.has(p.id));
  const projectReports: ProjectReport[] = displayProjects.map(p => {
    const prpts = allReports.filter(r => r.projectId === p.id);
    const latest = getLatestReport(prpts);
    const children = childByParent.get(p.id) || [];
    const childReports = children.length > 0
      ? children.map(c => {
          const crpts = allReports.filter(r => r.projectId === c.id);
          const clatest = getLatestReport(crpts);
          return { project: c, latestReport: clatest };
        })
      : undefined;
    return {
      project: p,
      latestReport: latest,
      childReports,
      isParentWithChildren: children.length > 0,
    };
  });

  const today = new Date();
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // 找到最新一期周报的日期范围作为PDF标题
  let dateRangeTitle = '';
  if (allReports.length > 0) {
    const latestReport = getLatestReport(allReports)!;
    dateRangeTitle = escapeHtml(`${formatDateChinese(latestReport.weekStart)}-${formatDateChinese(latestReport.weekEnd)}`);
  } else {
    dateRangeTitle = escapeHtml(fmtDate(today));
  }

  const levelBadge = (level: string) => {
    const colors: Record<string, string> = {
      '高': 'background:#FDE8E8;color:#A32D2D;',
      '中': 'background:#FAEEDA;color:#854F0B;',
      '低': 'background:#EAF3DE;color:#3B6D11;',
    };
    return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;font-size:11px;${colors[level] || ''}">${escapeHtml(level)}</span>`;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      '待处理': 'background:#FDE8E8;color:#A32D2D;',
      '持续关注': 'background:#FAEEDA;color:#854F0B;',
    };
    return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;font-size:11px;margin-left:6px;${colors[status] || ''}">${escapeHtml(status)}</span>`;
  };

  // 3. 构建 HTML（所有用户输入均经过 escapeHtml 转义）
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>项目周报汇总</title>
<style>
  @page { margin: 15mm 12mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif; font-size: 12px; color: #333; line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  
  .header { text-align: center; padding: 16px 0 12px; border-bottom: 3px double #4F8EF7; margin-bottom: 18px; }
  .header h1 { font-size: 20px; color: #1a3a5c; letter-spacing: 2px; margin-bottom: 4px; }
  .header .sub { font-size: 12px; color: #888; }
  
  .section-title { font-size: 15px; font-weight: 700; color: #1a3a5c; margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #4F8EF7; display: flex; align-items: center; gap: 8px; }
  .section-title .icon { font-size: 16px; }
  
  .risk-card { padding: 8px 12px; margin-bottom: 6px; border-left: 4px solid #FB923C; background: #FFFBF5; border-radius: 0 4px 4px 0; page-break-inside: avoid; }
  .risk-card .project-tag { display: inline-block; padding: 1px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; color: #fff; margin-left: 8px; }
  .risk-desc { font-weight: 500; }
  .risk-suggestion { font-size: 11px; color: #888; margin-top: 2px; padding-left: 4px; }
  
  .project-section { margin-bottom: 16px; page-break-inside: avoid; }
  .project-header { display: flex; align-items: center; gap: 10px; padding: 8px 0 6px; margin-bottom: 8px; border-bottom: 1px solid #e0e0e0; }
  .project-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .project-name { font-size: 14px; font-weight: 700; }
  .project-meta { font-size: 11px; color: #888; }
  .project-progress { margin-left: auto; font-size: 16px; font-weight: 700; }
  
  .sub-title { font-size: 12px; font-weight: 600; color: #555; margin: 8px 0 4px; padding-left: 4px; border-left: 3px solid #4F8EF7; }
  .text-block { padding: 4px 12px; color: #555; font-size: 12px; }
  .item-list { padding: 2px 0; }
  .item { padding: 3px 12px; font-size: 12px; display: flex; }
  .item-num { color: #aaa; margin-right: 6px; min-width: 20px; }
  .item-title { flex: 1; }
  .item-detail { font-size: 11px; color: #999; }
  
  .risk-item { padding: 4px 12px; margin: 2px 0; background: #FFFBF5; border-left: 3px solid #f0c040; border-radius: 0 4px 4px 0; font-size: 12px; }
  .risk-item .rk-desc { font-weight: 500; }
  .risk-item .rk-sugg { font-size: 11px; color: #888; margin-top: 1px; }
  .risk-item.new { border-left-color: #ff6b6b; background: #FFF5F5; }
  .risk-group-label { font-size: 11px; font-weight: 600; color: #666; margin: 8px 0 4px; padding: 2px 0; }
  .risk-group-label.new { color: #D85A30; }
  
  .empty { padding: 8px 12px; color: #bbb; font-size: 12px; font-style: italic; }
  
  .footer { text-align: center; padding: 16px 0 0; margin-top: 20px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #bbb; }
  
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .risk-card, .risk-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>📋 本周工作汇总（${dateRangeTitle}）</h1>
  <div class="sub">共 ${projects.length} 个项目，${allUnresolvedRisks.length} 项高风险</div>
</div>

<!-- 高风险汇总 -->
<div class="section-title"><span class="icon">⚠️</span> 高风险汇总 <span style="font-size:11px;color:#FB923C;font-weight:400;">（待处理 + 持续关注，去重共 ${allUnresolvedRisks.length} 项）</span></div>
${allUnresolvedRisks.length === 0
  ? '<div class="empty">🎉 当前所有项目无高风险，继续保持！</div>'
  : allUnresolvedRisks.map(({ projectName, color, risk }) => `
<div class="risk-card">
  <span class="risk-desc">${levelBadge(risk.level)} ${escapeHtml(risk.description)}</span>
  <span class="project-tag" style="background:${escapeHtml(color)};">${escapeHtml(projectName)}</span>
  ${statusBadge(risk.status)}
  ${risk.suggestion ? `<div class="risk-suggestion">💡 ${escapeHtml(risk.suggestion)}</div>` : ''}
</div>`).join('')}

<!-- 分隔线 -->
<div style="border-top:1px dashed #ddd;margin:16px 0;"></div>

<!-- 各项目详细内容 -->
${projectReports.map(pr => {
  const { project, latestReport, childReports, isParentWithChildren } = pr;
  // 辅助：渲染子项目标签
  const childTag = (name: string, color: string) =>
    `<span style="display:inline-block;padding:1px 8px;border-radius:3px;font-size:11px;font-weight:500;color:#fff;background:${escapeHtml(color)};margin-right:4px;">${escapeHtml(name)}</span>`;

  if (isParentWithChildren && childReports && childReports.length > 0) {
    // 父项目有子项目：建设目标/重点内容来自父项目，其他汇总自子项目
    const totalCompleted = childReports.reduce((s, cr) => s + (cr.latestReport?.completedItems.length || 0), 0);
    const totalPlanned = childReports.reduce((s, cr) => s + (cr.latestReport?.plannedItems.length || 0), 0);
    let itemIdx = 0;
    return `
<div class="project-section">
  <div class="project-header">
    <span class="project-dot" style="background:${escapeHtml(project.color)};"></span>
    <span class="project-name">${escapeHtml(project.name)}</span>
    <span class="project-meta">负责人：${escapeHtml(project.owner)} · 子项目 ${childReports.length} 个</span>
  </div>

  <div class="sub-title">📌 建设目标</div>
  <div class="text-block">${escapeHtml(latestReport?.goals || '暂无')}</div>

  <div class="sub-title">🔥 重点内容</div>
  <div class="text-block">${escapeHtml(latestReport?.highlights || '暂无')}</div>

  <div class="sub-title">✅ 本周完成事项（${totalCompleted}项）</div>
  ${totalCompleted === 0
    ? '<div class="empty">暂无记录</div>'
    : `<div class="item-list">${childReports.filter(cr => cr.latestReport).map(cr => {
      const items = cr.latestReport!.completedItems;
      return items.length === 0 ? '' : items.map(item => {
        itemIdx++;
        return `
        <div class="item" style="border-bottom:1px solid #f5f5f5;">
          <span class="item-num">${itemIdx}.</span>
          <div>
            <div class="item-title">${childTag(cr.project.name, cr.project.color)}${escapeHtml(item.title)}</div>
            ${item.progress ? `<div class="item-detail">进展：${escapeHtml(item.progress)}</div>` : ''}
            ${item.acceptance ? `<div class="item-detail">验收：${escapeHtml(item.acceptance)}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    }).join('')}</div>`
  }

  <div class="sub-title">📅 下周工作计划（${totalPlanned}项）</div>
  ${totalPlanned === 0
    ? '<div class="empty">暂无计划</div>'
    : `<div class="item-list">${(() => { let pi = 0; return childReports.filter(cr => cr.latestReport).map(cr => {
      const items = cr.latestReport!.plannedItems;
      return items.length === 0 ? '' : items.map(item => {
        pi++;
        return `
        <div class="item" style="border-bottom:1px solid #f5f5f5;">
          <span class="item-num">${pi}.</span>
          <div>
            <div class="item-title">${childTag(cr.project.name, cr.project.color)}${escapeHtml(item.title)}</div>
            ${item.reason ? `<div class="item-detail" style="color:#FB923C;">📎 未完成原因：${escapeHtml(item.reason)}</div>` : ''}
          </div>
        </div>`;
      }).join('');
    }).join(''); })()}</div>`
  }

  <div class="sub-title">⚡ 风险提示</div>
  ${(() => {
    // 收集所有子项目的跨周报风险
    interface ChildRiskEntry { risk: Risk; childName: string; childColor: string; isNew: boolean; }
    const allChildRisks: ChildRiskEntry[] = [];
    childReports.forEach(cr => {
      const { newThisWeek, historical } = collectProjectUnresolvedRisks(cr.project.id, allReports);
      newThisWeek.forEach(rk => allChildRisks.push({ risk: rk, childName: cr.project.name, childColor: cr.project.color, isNew: true }));
      historical.forEach(rk => allChildRisks.push({ risk: rk, childName: cr.project.name, childColor: cr.project.color, isNew: false }));
    });
    if (allChildRisks.length === 0) return '<div class="empty">所有子项目暂无待处理风险</div>';

    const sortByLevel = (a: ChildRiskEntry, b: ChildRiskEntry) =>
      (RISK_LEVEL_ORDER[a.risk.level] ?? 9) - (RISK_LEVEL_ORDER[b.risk.level] ?? 9);
    const newRisks = allChildRisks.filter(r => r.isNew).sort(sortByLevel);
    const oldRisks = allChildRisks.filter(r => !r.isNew).sort(sortByLevel);

    const riskHtml = (entry: ChildRiskEntry) => `
        <div class="risk-item${entry.isNew ? ' new' : ''}">
          <span class="rk-desc">${childTag(entry.childName, entry.childColor)}${levelBadge(entry.risk.level)} ${escapeHtml(entry.risk.description)}</span>
          ${statusBadge(entry.risk.status)}
          ${entry.risk.suggestion ? `<div class="rk-sugg">💡 ${escapeHtml(entry.risk.suggestion)}</div>` : ''}
        </div>`;

    let html = '';
    if (newRisks.length > 0) {
      html += `<div class="risk-group-label new">🆕 本周新增（${newRisks.length}项）</div>`;
      html += newRisks.map(riskHtml).join('');
    }
    if (oldRisks.length > 0) {
      html += `<div class="risk-group-label">📋 历史风险（${oldRisks.length}项）</div>`;
      html += oldRisks.map(riskHtml).join('');
    }
    return html;
  })()}
</div>`;
  }

  // 无子项目或子项目独立展示：原有格式
  return `
<div class="project-section">
  <div class="project-header">
    <span class="project-dot" style="background:${escapeHtml(project.color)};"></span>
    <span class="project-name">${escapeHtml(project.name)}</span>
    <span class="project-meta">负责人：${escapeHtml(project.owner)} · 状态：${escapeHtml(project.status)}</span>
    <span class="project-progress" style="color:${escapeHtml(project.color)};">${latestReport?.progress ?? 0}%</span>
  </div>

  ${!latestReport ? '<div class="empty">该项目暂无周报数据</div>' : `
    <div class="sub-title">📌 建设目标</div>
    <div class="text-block">${escapeHtml(latestReport.goals || '暂无')}</div>

    <div class="sub-title">🔥 重点内容</div>
    <div class="text-block">${escapeHtml(latestReport.highlights || '暂无')}</div>

    <div class="sub-title">✅ 本周完成事项（${latestReport.completedItems.length}项）</div>
    ${latestReport.completedItems.length === 0
      ? '<div class="empty">暂无记录</div>'
      : `<div class="item-list">${latestReport.completedItems.map((item, i) => `
        <div class="item" style="${i < latestReport.completedItems.length - 1 ? 'border-bottom:1px solid #f5f5f5;' : ''}">
          <span class="item-num">${item.order}.</span>
          <div>
            <div class="item-title">${escapeHtml(item.title)}</div>
            ${item.progress ? `<div class="item-detail">进展：${escapeHtml(item.progress)}</div>` : ''}
            ${item.acceptance ? `<div class="item-detail">验收：${escapeHtml(item.acceptance)}</div>` : ''}
            ${item.detail ? `<div class="item-detail">${escapeHtml(item.detail)}</div>` : ''}
          </div>
        </div>`).join('')}</div>`
    }

    <div class="sub-title">📅 下周工作计划（${latestReport.plannedItems.length}项）</div>
    ${latestReport.plannedItems.length === 0
      ? '<div class="empty">暂无计划</div>'
      : `<div class="item-list">${latestReport.plannedItems.map((item, i) => `
        <div class="item" style="${i < latestReport.plannedItems.length - 1 ? 'border-bottom:1px solid #f5f5f5;' : ''}">
          <span class="item-num">${item.order}.</span>
          <div>
            <div class="item-title">${escapeHtml(item.title)}</div>
            ${item.reason ? `<div class="item-detail" style="color:#FB923C;">📎 未完成原因：${escapeHtml(item.reason)}</div>` : ''}
          </div>
        </div>`).join('')}</div>`
    }

    <div class="sub-title">⚡ 风险提示</div>
    ${(() => {
      const { newThisWeek, historical } = collectProjectUnresolvedRisks(project.id, allReports);
      const total = newThisWeek.length + historical.length;
      if (total === 0) return '<div class="empty">该项目暂无待处理风险</div>';
      const riskHtml = (rk: Risk, isNew: boolean) => `
        <div class="risk-item${isNew ? ' new' : ''}">
          <span class="rk-desc">${levelBadge(rk.level)} ${escapeHtml(rk.description)}</span>
          ${statusBadge(rk.status)}
          ${rk.suggestion ? `<div class="rk-sugg">💡 ${escapeHtml(rk.suggestion)}</div>` : ''}
        </div>`;
      let html = '';
      if (newThisWeek.length > 0) {
        html += `<div class="risk-group-label new">🆕 本周新增（${newThisWeek.length}项）</div>`;
        html += newThisWeek.map(rk => riskHtml(rk, true)).join('');
      }
      if (historical.length > 0) {
        html += `<div class="risk-group-label">📋 历史风险（${historical.length}项）</div>`;
        html += historical.map(rk => riskHtml(rk, false)).join('');
      }
      return html;
    })()}
  `}
</div>`;
}).join('')}

<div class="footer">
  本报告由项目跟踪管理系统自动生成 · ${escapeHtml(fmtDate(today))} ${escapeHtml(fmtTime(today))}
</div>

</body>
</html>`;

  // 4. 打开新窗口并触发打印
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('请允许弹出窗口以导出 PDF');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // 等待资源加载后打印
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };
  // 如果 onload 不触发（某些浏览器），直接调用
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
