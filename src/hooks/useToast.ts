import { useState, useCallback, useRef } from 'react';

export interface ToastState {
  msg: string;
  type: 'success' | 'error';
}

/**
 * 统一 Toast hook：自动清理定时器，组件卸载时安全。
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  return { toast, showToast, clearToast, setToast };
}
