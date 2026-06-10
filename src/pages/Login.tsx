import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { doLogin, doRegister } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        // 注册
        if (!displayName.trim()) {
          setError('请输入显示名称');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('密码至少需要6位');
          setLoading(false);
          return;
        }
        const errMsg = await doRegister(email, password, displayName.trim());
        if (errMsg) {
          setError(errMsg);
        } else {
          setError('');
          navigate('/');
        }
      } else {
        // 登录
        const ok = await doLogin(email, password);
        if (ok) {
          navigate('/');
        } else {
          setError('邮箱或密码错误');
        }
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={shared.loginPage}>
      <div className={shared.loginBox}>
        <h1 className={shared.loginTitle}>项目跟踪管理系统</h1>
        <p className={shared.loginSub}>
          {isRegister ? '创建新账号' : '登录您的账号'}
        </p>
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setError(''); }}
              placeholder="显示名称（如：张三）"
              className={shared.loginInput}
              autoFocus
              disabled={loading}
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="邮箱地址"
            className={shared.loginInput}
            autoFocus={!isRegister}
            disabled={loading}
          />
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder={isRegister ? '设置密码（至少6位）' : '输入密码'}
            className={shared.loginInput}
            disabled={loading}
          />
          {error && <p className={shared.loginError}>{error}</p>}
          <button
            type="submit"
            className={shared.loginBtn}
            disabled={loading}
          >
            {loading ? '请稍候...' : isRegister ? '注 册' : '登 录'}
          </button>
        </form>
        <p
          className={shared.loginSub}
          style={{ marginTop: 16, cursor: 'pointer', fontSize: 14 }}
          onClick={() => { setIsRegister(!isRegister); setError(''); }}
        >
          {isRegister ? '已有账号？去登录' : '没有账号？点此注册'}
        </p>
      </div>
    </div>
  );
}
