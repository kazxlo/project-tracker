import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Workspace from './pages/Workspace';

// 路由级代码分割：按需加载各页面，减小首屏 JS 体积（例如 recharts 仅在趋势页加载）
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const ReportEdit = lazy(() => import('./pages/ReportEdit'));
const Trends = lazy(() => import('./pages/Trends'));
const Cockpit = lazy(() => import('./pages/Cockpit'));
const Admin = lazy(() => import('./pages/Admin'));

/** 懒加载页面的占位提示 */
function PageLoading() {
  return <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-muted)' }}>加载中…</div>;
}

/** 将懒加载页面包在 Suspense 内：边界位于 Layout 内容区，切换时导航栏不会被卸载 */
function withSuspense(node: ReactNode) {
  return <Suspense fallback={<PageLoading />}>{node}</Suspense>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Workspace />} />
              <Route path="/cockpit" element={withSuspense(<Cockpit />)} />
              <Route path="/project/:id" element={withSuspense(<ProjectDetail />)} />
              <Route path="/project/:id/report/new" element={withSuspense(<ReportEdit />)} />
              <Route path="/project/:id/report/:reportId" element={withSuspense(<ReportEdit />)} />
              <Route path="/trends" element={withSuspense(<Trends />)} />
              <Route path="/admin" element={withSuspense(<Admin />)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
