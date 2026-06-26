import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface TopNavProps {
  /** 当前激活的页面标识，为空时不激活任何Tab（如项目详情页） */
  active?: 'workspace' | 'cockpit' | 'trends' | 'admin';
  /** 主题：dark=深色全屏页(workspace/cockpit)，light=浅色框架页 */
  theme: 'dark' | 'light';
  styles: Record<string, string>;
}

/**
 * 统一顶部导航：消除 workspace/cockpit 重复，保证导航项一致。
 * 通过 theme + styles 适配深浅主题。
 */
export default function TopNav({ active, theme, styles }: TopNavProps) {
  const activeKey = active || '';
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const items: { key: TopNavProps['active']; label: string; to: string }[] = [
    { key: 'workspace', label: '工作台', to: '/' },
    { key: 'cockpit', label: '驾驶舱', to: '/cockpit' },
    { key: 'trends', label: '趋势分析', to: '/trends' },
  ];
  if (isAdmin) items.push({ key: 'admin', label: '管理中心', to: '/admin' });

  const itemCls = (key: TopNavProps['active']) =>
    `${styles.topNavItem} ${activeKey === key ? styles.topNavActive : ''} ${activeKey !== key && theme === 'dark' ? styles.topNavLink : ''}`;

  return (
    <nav className={styles.topNav}>
      {items.map(it =>
        activeKey === it.key ? (
          <span key={it.key} className={itemCls(it.key)}>{it.label}</span>
        ) : (
          <Link key={it.key} to={it.to} className={itemCls(it.key)}>{it.label}</Link>
        )
      )}
    </nav>
  );
}
