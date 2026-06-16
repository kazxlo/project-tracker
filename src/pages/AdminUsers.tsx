import { useState, useEffect } from 'react';
import { getAllProfiles, updateProfileRole, UserProfile } from '../api/profiles';
import { useAuth } from '../hooks/useAuth';
import shared from '../styles/shared.module.css';

export default function AdminUsers() {
  const { userId } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const loadUsers = async () => {
    try {
      const all = await getAllProfiles();
      setUsers(all);
    } catch (err) {
      console.error('加载用户列表失败:', err);
      showToast('加载失败，请刷新', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleRole = async (targetUserId: string) => {
    if (targetUserId === userId) {
      showToast('不能修改自己的角色', 'error');
      return;
    }
    const user = users.find(u => u.id === targetUserId);
    if (!user) return;
    if (user.role === 'public') {
      showToast('不能修改公共访问账号的角色', 'error');
      return;
    }
    const newRole = user.role === 'admin' ? 'member' : 'admin';
    try {
      await updateProfileRole(targetUserId, newRole);
      setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
      showToast(`已${newRole === 'admin' ? '设为' : '取消'}管理员`, 'success');
    } catch (err) {
      console.error('更新角色失败:', err);
      showToast('操作失败，请重试', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#6b7a93' }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className={`${shared.toast} ${toast.type === 'success' ? shared.toastSuccess : shared.toastError}`}>
          {toast.msg}
        </div>
      )}

      <h2 className={shared.pageTitle}>用户管理</h2>

      <div className={shared.section}>
        <p className={shared.textSmall} style={{ color: '#6b7a93', marginBottom: 16 }}>
          共 {users.length} 位用户。管理员可创建/删除项目，普通成员只能填写周报。
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e0e5ec' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#6b7a93' }}>用户</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#6b7a93' }}>角色</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#6b7a93' }}>注册时间</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#6b7a93' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #f0f2f7' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{u.display_name}</div>
                  <div style={{ fontSize: 12, color: '#6b7a93' }}>
                    {u.id === userId ? '(当前用户)' : ''}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <span
                    className={`${shared.badge}`}
                    style={{
                      fontSize: 12,
                      padding: '2px 10px',
                      borderRadius: 4,
                      background: u.role === 'admin' ? '#EAF3DE' : u.role === 'public' ? '#FFF3E0' : '#f0f0f0',
                      color: u.role === 'admin' ? '#2d8a4e' : u.role === 'public' ? '#E65100' : '#6b7a93',
                    }}
                  >
                    {u.role === 'admin' ? '管理员' : u.role === 'public' ? '公共访问' : '普通成员'}
                  </span>
                </td>
                <td style={{ padding: '12px', fontSize: 13, color: '#6b7a93' }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'}
                </td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  <button
                    className={shared.btnToolbar}
                    onClick={() => handleToggleRole(u.id)}
                    disabled={u.id === userId || u.role === 'public'}
                    title={u.id === userId ? '不能修改自己的角色' : u.role === 'public' ? '公共访问账号角色不可修改' : ''}
                    style={u.id === userId || u.role === 'public' ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                  >
                    {u.role === 'admin' ? '取消管理员' : u.role === 'public' ? '—' : '设为管理员'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
