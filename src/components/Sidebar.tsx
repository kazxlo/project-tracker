import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getProjects } from '../api/db';
import { useAuth } from '../hooks/useAuth';
import { filterVisibleProjects, COLOR_PALETTE } from '../utils/helpers';
import type { Project } from '../types';
import Icon from './Icon';
import styles from '../styles/sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { key: 'workspace', path: '/', label: '工作台', icon: 'workspace' as const },
  { key: 'cockpit', path: '/cockpit', label: '驾驶舱', icon: 'cockpit' as const },
  { key: 'trends', path: '/trends', label: '趋势分析', icon: 'trends' as const },
];

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { username, role, userId, doLogout } = useAuth();
  const location = useLocation();
  const isAdmin = role === 'admin';

  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    getProjects().then(projs => {
      setProjects(filterVisibleProjects(projs, userId, role).filter(p => !p.parentId));
    }).catch(() => {});
  }, [userId, role]);

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  const isProjectPage = location.pathname.startsWith('/project/');

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <Icon name="dashboard" size={20} color="#fff" />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>ProjectM</span>
          <span className={styles.brandSub}>项目跟踪管理</span>
        </div>
        <button className={styles.collapseToggle} onClick={onToggle} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} />
        </button>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navSection}>
          <div className={styles.navLabel}>导航</div>
          {navItems.map(item => (
            <Link
              key={item.key}
              to={item.path}
              className={`${styles.navItem} ${isActive(item.path) ? styles.navItemActive : ''}`}
            >
              <Icon name={item.icon} size={16} />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* 项目二级菜单：驾驶舱下方 */}
          <div
            className={`${styles.subGroup} ${projectsExpanded ? styles.subGroupOpen : ''}`}
            onClick={() => setProjectsExpanded(v => !v)}
            role="button"
          >
            <Icon name={projectsExpanded ? 'chevronDown' : 'chevronRight'} size={12} />
            <span>项目列表</span>
            <span className={styles.subCount}>{projects.length}</span>
          </div>
          {projectsExpanded && projects.map((p, i) => {
            const pid = p.id;
            const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
            const active = isProjectPage && location.pathname.includes(pid);
            return (
              <Link
                key={pid}
                to={`/project/${pid}`}
                className={`${styles.subItem} ${active ? styles.subItemActive : ''}`}
              >
                <span
                  className={styles.subDot}
                  style={{ background: color }}
                />
                <span>{p.name}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              to="/admin"
              className={`${styles.navItem} ${isActive('/admin') ? styles.navItemActive : ''}`}
            >
              <Icon name="admin" size={16} />
              <span>管理中心</span>
            </Link>
          )}
        </div>
      </nav>

      <div className={styles.footer}>
        <div className={styles.userSection}>
          <div className={styles.userAvatar}>{username.charAt(0)}</div>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{username}</span>
            {isAdmin && <span className={styles.userRole}>管理员</span>}
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={doLogout} title="退出登录">
          <Icon name="logout" size={15} />
        </button>
      </div>
    </aside>
  );
}
