import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

const PUBLIC_EMAIL = import.meta.env.VITE_PUBLIC_EMAIL as string;
const PUBLIC_USERNAME = import.meta.env.VITE_PUBLIC_USERNAME as string;
const ALLOW_REGISTRATION = import.meta.env.VITE_ALLOW_REGISTRATION !== 'false';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
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
        const errMsg = await doRegister(username, password, displayName.trim());
        if (errMsg) {
          setError(errMsg);
        } else {
          setError('');
          navigate('/');
        }
      } else {
        // 登录：公共账号特殊处理（仅当环境变量配置了才生效）
        const loginEmail = (PUBLIC_USERNAME && username === PUBLIC_USERNAME) ? PUBLIC_EMAIL : username;
        const ok = await doLogin(loginEmail, password);
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
            type={isRegister ? 'email' : 'text'}
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            placeholder={isRegister ? '邮箱地址' : '用户名 / 邮箱地址'}
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
        {ALLOW_REGISTRATION && (
          <p
            className={shared.loginSub}
            style={{ marginTop: 16, cursor: 'pointer', fontSize: 14 }}
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
          >
            {isRegister ? '已有账号？去登录' : '没有账号？点此注册'}
          </p>
        )}
      </div>
    </div>
  );
}
