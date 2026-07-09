import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatDate, getWeekRange } from '../utils/helpers';
import Sidebar from './Sidebar';
import Icon from './Icon';

const PUBLIC_BLOCKED = ['/report/new', '/admin'];
const THEME_KEY = 'projectm-theme';
const SIDEBAR_KEY = 'projectm-sidebar-collapsed';

function getPageInfo(pathname: string) {
  if (pathname === '/') return { category: '', title: '个人工作台' };
  if (pathname === '/cockpit') return { category: '', title: '领导驾驶舱' };
  if (pathname === '/trends') return { category: '分析', title: '趋势分析' };
  if (pathname === '/admin') return { category: '管理', title: '管理中心' };
  if (pathname.startsWith('/project/')) {
    const sub = pathname.replace('/project/', '');
    if (sub.includes('/report/new')) return { category: '项目详情', title: '新建周报' };
    if (sub.includes('/report/')) return { category: '项目详情', title: '编辑周报' };
    return { category: '项目详情', title: sub };
  }
  return { category: '', title: '' };
}

export default function Layout() {
  const { isLoggedIn, role, loading } = useAuth();
  const location = useLocation();
  const isPublic = role === 'public';

  // 主题状态
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  // 侧边栏收缩状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    return saved === 'true';
  });

  // 同步主题到 html data-theme + localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // 同步 sidebar 宽度 CSS 变量
  useEffect(() => {
    const width = sidebarCollapsed ? 'var(--sidebar-collapsed-width, 56px)' : 'var(--sidebar-width, 220px)';
    document.documentElement.style.setProperty('--sidebar-width', sidebarCollapsed ? '56px' : '220px');
  }, [sidebarCollapsed]);

  // 持久化 sidebar 状态
  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>加载中...</p>
      </div>
    );
  }

  if (!isLoggedIn && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (!isLoggedIn && location.pathname === '/login') {
    return <Outlet />;
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  if (isPublic && PUBLIC_BLOCKED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/" replace />;
  }

  const pageInfo = getPageInfo(location.pathname);
  const { start, end } = getWeekRange();

  return (
    <div className="app-shell">
      <div className="sidebar-col">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </div>

      <div className="main-col">
        <header className="topbar">
          <button
            className="topbar-icon-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronDown'} size={16} />
          </button>
          <div className="topbar-left">
            <span>{pageInfo.category || pageInfo.title}</span>
            {!isPublic && (
              <>
                <span className="sep">·</span>
                <span>本周: {formatDate(start)} - {formatDate(end)}</span>
              </>
            )}
          </div>
          <div className="topbar-right">
            <button
              className="topbar-icon-btn"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          </div>
        </header>

        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
