import { Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { formatDate, getWeekRange } from '../utils/helpers';
import shared from '../styles/shared.module.css';

const PUBLIC_BLOCKED = ['/report/new', '/admin'];

export default function Layout() {
  const { isLoggedIn, username, role, loading, doLogout } = useAuth();
  const location = useLocation();
  const isPublic = role === 'public';

  // 初始化加载中
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: '#999' }}>加载中...</p>
      </div>
    );
  }

  // 认证守卫：未登录用户只能访问 /login，其他路径均重定向到 /login（用 Navigate 组件，避免渲染阶段副作用）
  if (!isLoggedIn && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (!isLoggedIn && location.pathname === '/login') {
    return <Outlet />;
  }

  // 已登录用户访问 /login 时重定向到首页
  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  // public 用户访问新建/管理页面时重定向回首页（用 startsWith 精确匹配路径前缀，避免 includes 误匹配）
  if (isPublic && PUBLIC_BLOCKED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/" replace />;
  }

  const isFullscreenPage = location.pathname === '/' || location.pathname === '/cockpit' || location.pathname === '/trends' || location.pathname === '/admin';

  const tabs = [
    { path: '/', label: '工作台' },
    { path: '/cockpit', label: '驾驶舱' },
    { path: '/trends', label: '趋势分析' },
  ];
  if (role === 'admin') {
    tabs.push({ path: '/admin', label: '管理中心' });
  }

  const { start, end } = getWeekRange();

  // 工作台 & 驾驶舱全屏模式：隐藏 Header 和 Navbar
  if (isFullscreenPage) {
    return <Outlet />;
  }

  return (
    <div className={shared.pageWrap}>
      <header className={shared.header}>
        <div className={shared.headerLeft}>
          <Link to="/" className={shared.brand}>项目跟踪管理系统</Link>
          <span className={shared.weekLabel}>本周: {formatDate(start)} - {formatDate(end)}</span>
        </div>
        <div className={shared.headerRight}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {tabs.map(t => (
              <Link
                key={t.path}
                to={t.path}
                className={`${shared.topNavItem} ${location.pathname === t.path ? shared.topNavActive : shared.topNavLink}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <span className={shared.textSmall} style={{ color: '#6b7a93' }}>
            {username}
            {role === 'admin' && <span style={{ fontSize: 11, color: '#4F8EF7', marginLeft: 4 }}>(管理员)</span>}
            {role === 'public' && <span style={{ fontSize: 11, color: '#6b7a93', marginLeft: 4 }}>(公共访问)</span>}
          </span>
          <button className={shared.btnLogout} onClick={() => { doLogout(); }}>退出</button>
        </div>
      </header>

      <main className={shared.main}>
        <Outlet />
      </main>
    </div>
  );
}
