import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { AuthState } from '../types';
import { login, isLoggedIn, setLoggedIn, logout, getCurrentUser } from '../api/storage';

interface AuthContextType extends AuthState {
  doLogin: (password: string) => boolean;
  doLogout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  username: '',
  doLogin: () => false,
  doLogout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: isLoggedIn(),
    username: getCurrentUser(),
  });

  const doLogin = (password: string): boolean => {
    if (login(password)) {
      setLoggedIn('管理员');
      setState({ isLoggedIn: true, username: '管理员' });
      return true;
    }
    return false;
  };

  const doLogout = () => {
    logout();
    setState({ isLoggedIn: false, username: '' });
  };

  return (
    <AuthContext.Provider value={{ ...state, doLogin, doLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
