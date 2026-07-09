import { Component, ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: 'var(--color-text)',
          background: 'var(--color-bg)',
        }}>
          <Icon name="alert" size={48} color="#EF4444" />
          <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 12 }}>页面出现错误</h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 24 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            style={{
              background: 'var(--color-primary)',
              color: 'var(--color-text-inverse)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            返回首页
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
