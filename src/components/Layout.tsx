import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

export default function Layout() {
  const { isLoggedIn, username, loading, doLogout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 初始化加载中
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ color: '#999' }}>加载中...</p>
      </div>
    );
  }

  // 认证守卫：未登录用户只能访问 /login，其他路径均重定向到 /login
  if (!isLoggedIn) {
    if (location.pathname !== '/login') {
      navigate('/login', { replace: true });
      return null;
    }
    return <Outlet />;
  }

  // 已登录用户访问 /login 时重定向到首页
  if (location.pathname === '/login') {
    navigate('/', { replace: true });
    return null;
  }

  const tabs = [
    { path: '/', label: '项目总览' },
    { path: '/trends', label: '趋势分析' },
  ];

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className={shared.pageWrap}>
      <header className={shared.header}>
        <div className={shared.headerLeft}>
          <Link to="/" className={shared.brand}>
            项目跟踪管理系统
          </Link>
          <span className={shared.weekLabel}>本周: {fmt(monday)} - {fmt(friday)}</span>
        </div>
        <div className={shared.headerRight}>
          <span className={shared.textSmall} style={{ color: '#666' }}>{username}</span>
          <button
            className={shared.btnLogout}
            onClick={() => { doLogout(); navigate('/login'); }}
          >
            退出
          </button>
        </div>
      </header>

      <nav className={shared.navbar}>
        {tabs.map(t => (
          <Link
            key={t.path}
            to={t.path}
            className={`${shared.navTab} ${location.pathname === t.path ? shared.navTabActive : shared.navTabInactive}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <main className={shared.main}>
        <Outlet />
      </main>
    </div>
  );
}
