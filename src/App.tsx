import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import ProjectDetail from './pages/ProjectDetail';
import ReportEdit from './pages/ReportEdit';
import Trends from './pages/Trends';
import Cockpit from './pages/Cockpit';
import Workspace from './pages/Workspace';
import Admin from './pages/Admin';

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Cockpit />} />
              <Route path="/project/:id" element={<ProjectDetail />} />
              <Route path="/project/:id/report/new" element={<ReportEdit />} />
              <Route path="/project/:id/report/:reportId" element={<ReportEdit />} />
              <Route path="/trends" element={<Trends />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
