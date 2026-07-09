import { useNavigate } from 'react-router-dom';
import { getTodayStr, formatDate } from '../utils/helpers';
import type { Project } from '../types';
import shared from '../styles/shared.module.css';

interface ChildProjectCardProps {
  project: Project;
  stats: {
    reportCount: number;
    progress: number;
    riskCount: number;
  };
  onEdit: (p: Project) => void;
  onDelete: (id: string) => void;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  canEdit: boolean;
}

function formatPeriod(start?: string, end?: string): string {
  if (!start && !end) return '';
  if (start && end) return `${formatDate(start)}-${formatDate(end)}`;
  if (start) return `${formatDate(start)}-`;
  return `-${formatDate(end!)}`;
}

function getRemainingDays(serviceEnd?: string): number | null {
  if (!serviceEnd) return null;
  const today = getTodayStr();
  const end = new Date(serviceEnd + 'T00:00:00');
  const now = new Date(today + 'T00:00:00');
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getServiceRemainingRatio(serviceStart?: string, serviceEnd?: string): number {
  if (!serviceStart || !serviceEnd) return 100;
  const today = getTodayStr();
  const start = new Date(serviceStart + 'T00:00:00').getTime();
  const end = new Date(serviceEnd + 'T00:00:00').getTime();
  const now = new Date(today + 'T00:00:00').getTime();
  if (now < start) return 100; // 未开始，剩余100%
  if (now > end) return 0; // 已到期，剩余0%
  return Math.round(((end - now) / (end - start)) * 100);
}

function isServiceExpired(serviceEnd?: string): boolean {
  if (!serviceEnd) return false;
  return serviceEnd < getTodayStr();
}

export default function ChildProjectCard({
  project,
  stats,
  onEdit,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  canEdit,
}: ChildProjectCardProps) {
  const navigate = useNavigate();
  const STATUS_CLASS: Record<string, string> = {
    '正常推进': shared.tagNormal,
    '需关注': shared.tagWarning,
    '存在风险': shared.tagDanger,
  };
  const statusCls = STATUS_CLASS[project.status] || shared.tagNormal;
  const remainingRatio = getServiceRemainingRatio(project.serviceStart, project.serviceEnd);
  const expired = isServiceExpired(project.serviceEnd);
  const remainingDays = getRemainingDays(project.serviceEnd);

  return (
    <div
      className={shared.childProjectCard}
      style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: project.color }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        navigate(`/project/${project.id}`);
      }}
    >
      {/* 头：项目名 + 状态 */}
      <div className={shared.childProjectHeader}>
        <h4 className={shared.childProjectName}>
          <span className={shared.childProjectDot} style={{ background: project.color }} />
          {project.name}
        </h4>
        <span className={`${shared.badge} ${statusCls}`} style={{ fontSize: 11, padding: '2px 8px' }}>
          {project.status}
        </span>
      </div>

      {/* 服务内容 */}
      {project.description && (
        <div className={shared.childProjectDesc}>{project.description}</div>
      )}

      {/* 负责人 */}
      <div className={shared.childProjectMeta}>
        <span>负责人 {project.owner}</span>
        {project.deadline && <span>截止 {project.deadline}</span>}
      </div>

      {/* 完成进度条 */}
      <div className={shared.childProgressSection}>
        <div className={shared.childProgressLabel}>
          <span>完成进度</span>
          <span className={shared.childProgressPercent} style={{ color: project.color }}>
            {stats.progress}%
          </span>
        </div>
        <div className={shared.childProgressBar}>
          <div
            className={shared.childProgressFill}
            style={{ width: `${stats.progress}%`, background: project.color }}
          />
        </div>
      </div>

      {/* 当前服务期 — 剩余时间 */}
      {(project.serviceStart || project.serviceEnd) && (
        <div className={`${shared.serviceTimeline} ${expired ? shared.serviceTimelineExpired : ''}`}>
          <span className={shared.serviceTimelineLabel}>当前服务期</span>
          <div className={shared.serviceTimelineBar}>
            <div
              className={shared.serviceTimelineFill}
              style={{
                width: `${remainingRatio}%`,
                background: expired ? 'var(--color-danger-light)' : remainingRatio <= 20 ? 'var(--color-warning)' : project.color,
              }}
            />
          </div>
          <span className={shared.serviceTimelineDate}>
            {formatPeriod(project.serviceStart, project.serviceEnd)}
            {remainingDays !== null && !expired && remainingDays <= 30 && (
              <span style={{ color: remainingDays <= 0 ? 'var(--color-danger-light)' : 'var(--color-warning)', marginLeft: 6, fontWeight: 500 }}>
                剩余{remainingDays}天
              </span>
            )}
            {expired && <span style={{ color: 'var(--color-danger-light)', marginLeft: 6, fontWeight: 500 }}>已到期</span>}
          </span>
        </div>
      )}

      {/* 底部统计 + 操作 */}
      <div className={shared.childProjectFooter}>
        <div className={shared.childProjectStats}>
          <span>周报 <strong>{stats.reportCount}</strong>期</span>
          <span>
            风险{' '}
            <strong style={{ color: stats.riskCount > 0 ? 'var(--color-danger-light)' : undefined }}>
              {stats.riskCount}
            </strong>
            项
          </span>
          <span className={shared.linkText}>查看详情 →</span>
        </div>
        {canEdit && (
          <div className={shared.childProjectActions}>
            <button
              className={shared.actionBtn}
              onClick={(e) => { e.stopPropagation(); onEdit(project); }}
            >
              编辑
            </button>
            <button
              data-delete-id={`child-${project.id}`}
              className={`${shared.actionBtn} ${shared.actionBtnDanger}`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDelete === project.id) {
                  onDelete(project.id);
                } else {
                  setConfirmDelete(project.id);
                }
              }}
            >
              {confirmDelete === project.id ? '确认删除？' : '删除'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
