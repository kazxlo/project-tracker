import type { ToastState } from '../hooks/useToast';
import shared from '../styles/shared.module.css';

/** 统一 Toast 渲染（浅色主题页面用） */
export default function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
      {toast.msg}
    </div>
  );
}
