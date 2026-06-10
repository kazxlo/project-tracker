import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { doLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (doLogin(password)) {
      navigate('/');
    } else {
      setError('密码错误');
    }
  };

  return (
    <div className={shared.loginPage}>
      <div className={shared.loginBox}>
        <h1 className={shared.loginTitle}>项目跟踪管理</h1>
        <p className={shared.loginSub}>请输入密码登录</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="输入密码"
            className={shared.loginInput}
            autoFocus
          />
          {error && <p className={shared.loginError}>{error}</p>}
          <button
            type="submit"
            className={shared.loginBtn}
          >
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
