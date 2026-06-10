export interface UserProfile {
  id: string;
  email?: string;
  display_name: string;
  role: string;
  created_at: string;
}

import { supabase } from './supabase';

/** 获取所有用户（仅 admin 可调用，RLS 保证） */
export async function getAllProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as UserProfile[];
}

/** 更新用户角色（仅 admin 可调用，RLS 保证） */
export async function updateProfileRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}
