import type { ReactNode } from 'react';
import shared from '../styles/shared.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 自定义宽度，默认走 shared.modal */
  width?: number | string;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnOverlay?: boolean;
}

/**
 * 统一 Modal 组件：遮罩点击关闭、内容 stopPropagation、统一样式。
 */
export default function Modal({ title, onClose, children, footer, width, closeOnOverlay = true }: ModalProps) {
  return (
    <div className={shared.modalOverlay} onClick={() => { if (closeOnOverlay) onClose(); }}>
      <div
        className={shared.modal}
        onClick={e => e.stopPropagation()}
        style={width ? { minWidth: 'auto', maxWidth: width, width } : undefined}
      >
        <div className={shared.modalHeader}>
          <h3 className={shared.modalTitle}>{title}</h3>
          <button className={shared.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={shared.modalBody}>{children}</div>
        {footer && <div className={shared.modalFooter}>{footer}</div>}
      </div>
    </div>
  );
}
