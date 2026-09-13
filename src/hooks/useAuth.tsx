import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import { warmupCache } from '../api/db';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  isLoggedIn: boolean;
  username: string;
  userId: string;
  role: string;
  loading: boolean;
  doLogin: (email: string, password: string) => Promise<boolean>;
  doRegister: (email: string, password: string, displayName: string) => Promise<string>;
  doLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  username: '',
  userId: '',
  role: 'member',
  loading: true,
  doLogin: async () => false,
  doRegister: async () => '',
  doLogout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // 加载用户的显示名称和角色（带重试）
  const loadProfile = async (uid: string, retryCount = 0): Promise<void> => {
    try {
      // 用 select('*') 避免 PostgREST schema 缓存导致的 406
      // 用 maybeSingle() 避免 0 行时的 406
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (!mountedRef.current) return;

      if (error) {
        console.warn('loadProfile error:', error.message);
        // 重试最多3次，间隔递增
        if (retryCount < 3) {
          const delay = (retryCount + 1) * 800;
          retryTimerRef.current = setTimeout(() => loadProfile(uid, retryCount + 1), delay);
        }
        return;
      }

      if (data) {
        setDisplayName(data.display_name || '');
        setRole(data.role || 'member');
      } else if (retryCount < 3) {
        // profile 还没创建（触发器可能还在执行），重试
        const delay = (retryCount + 1) * 800;
        retryTimerRef.current = setTimeout(() => loadProfile(uid, retryCount + 1), delay);
      }
    } catch (err) {
      console.warn('loadProfile exception:', err);
      if (retryCount < 3) {
        retryTimerRef.current = setTimeout(() => loadProfile(uid, retryCount + 1), (retryCount + 1) * 800);
      }
    }
  };

  // 初始化：检查是否有已登录会话
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user);
        loadProfile(data.session.user.id);
        warmupCache();
      }
      setLoading(false);
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // 登录/注册后延迟加载 profile，给触发器执行时间
        setTimeout(() => loadProfile(session.user.id), 500);
        warmupCache();
      } else {
        setDisplayName('');
        setRole('member');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 邮箱 + 密码登录
  const doLogin = async (email: string, password: string): Promise<boolean> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  };

  // 注册新用户（profile 由数据库触发器自动创建）
  const doRegister = async (email: string, password: string, name: string): Promise<string> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name }  // 传入 user metadata，触发器会读取
      }
    });
    if (error) return error.message;
    if (!data.user) return '注册失败，请重试';

    // 触发器会自动创建 profile，这里手动加载一次
    await loadProfile(data.user.id);
    return ''; // 空字符串表示成功
  };

  // 退出登录
  const doLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      isLoggedIn: !!user,
      username: displayName || user?.email || '',
      userId: user?.id || '',
      role,
      loading,
      doLogin,
      doRegister,
      doLogout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
