import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  isLoggedIn: boolean;
  username: string;
  userId: string;
  loading: boolean;
  doLogin: (email: string, password: string) => Promise<boolean>;
  doRegister: (email: string, password: string, displayName: string) => Promise<string>;
  doLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  username: '',
  userId: '',
  loading: true,
  doLogin: async () => false,
  doRegister: async () => '',
  doLogout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  // 初始化：检查是否有已登录会话
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser(data.session.user);
        loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    // 监听认证状态变化（登录/登出/注册）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setDisplayName('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 加载用户的显示名称
  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', uid)
      .single();
    if (data?.display_name) {
      setDisplayName(data.display_name);
    }
  };

  // 邮箱 + 密码登录
  const doLogin = async (email: string, password: string): Promise<boolean> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  };

  // 注册新用户
  const doRegister = async (email: string, password: string, name: string): Promise<string> => {
    // 1. Supabase Auth 注册
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (!data.user) return '注册失败，请重试';

    // 2. 在 profiles 表中创建用户扩展信息
    await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: name,
    });

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
