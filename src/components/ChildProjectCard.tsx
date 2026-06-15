import { useNavigate } from 'react-router-dom';
import { Project, WeeklyReport } from '../types';
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
  isAdmin: boolean;
}

function formatPeriod(start?: string, end?: string): string {
  if (!start && !end) return '';
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00');
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `${fmt(start)} —`;
  return `— ${fmt(end!)}`;
}

function getServicePeriodProgress(serviceStart?: string, serviceEnd?: string): number {
  if (!serviceStart || !serviceEnd) return 0;
  const today = new Date().toISOString().split('T')[0];
  const start = new Date(serviceStart + 'T00:00:00').getTime();
  const end = new Date(serviceEnd + 'T00:00:00').getTime();
  const now = new Date(today + 'T00:00:00').getTime();
  if (now < start) return 0;
  if (now > end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function isServiceExpired(serviceEnd?: string): boolean {
  if (!serviceEnd) return false;
  const today = new Date().toISOString().split('T')[0];
  return serviceEnd < today;
}

export default function ChildProjectCard({
  project,
  stats,
  onEdit,
  onDelete,
  confirmDelete,
  setConfirmDelete,
  isAdmin,
}: ChildProjectCardProps) {
  const navigate = useNavigate();
  const STATUS_CLASS: Record<string, string> = {
    '正常推进': shared.tagNormal,
    '需关注': shared.tagWarning,
    '存在风险': shared.tagDanger,
  };
  const statusCls = STATUS_CLASS[project.status] || shared.tagNormal;
  const serviceProgress = getServicePeriodProgress(project.serviceStart, project.serviceEnd);
  const expired = isServiceExpired(project.serviceEnd);

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

      {/* 服务期时间线 */}
      {(project.serviceStart || project.serviceEnd) && (
        <div className={`${shared.serviceTimeline} ${expired ? shared.serviceTimelineExpired : ''}`}>
          <span className={shared.serviceTimelineLabel}>服务期</span>
          <div className={shared.serviceTimelineBar}>
            <div
              className={shared.serviceTimelineFill}
              style={{
                width: `${serviceProgress}%`,
                background: expired ? '#D85A30' : project.color,
              }}
            />
          </div>
          <span className={shared.serviceTimelineDate}>
            {formatPeriod(project.serviceStart, project.serviceEnd)}
          </span>
        </div>
      )}

      {/* 底部统计 + 操作 */}
      <div className={shared.childProjectFooter}>
        <div className={shared.childProjectStats}>
          <span>周报 <strong>{stats.reportCount}</strong>期</span>
          <span>
            风险{' '}
            <strong style={{ color: stats.riskCount > 0 ? '#D85A30' : undefined }}>
              {stats.riskCount}
            </strong>
            项
          </span>
          <span className={shared.linkText}>查看详情 →</span>
        </div>
        {isAdmin && (
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
