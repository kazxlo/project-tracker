/** 项目 */
export interface Project {
  id: string;
  name: string;
  owner: string;
  startDate: string;
  deadline?: string;           // 预计截止时间（YYYY-MM-DD）
  deadlineExtensions?: number;  // 已延期次数
  lastDeadline?: string;        // 上一次截止时间（YYYY-MM-DD）
  status: '正常推进' | '需关注' | '存在风险';
  color: string;
  viewerIds?: string[];         // 可见用户ID列表，NULL/空=所有人可见
  parentId?: string;            // 父项目ID，空=顶层项目
  description?: string;         // 服务内容简述
  serviceStart?: string;        // 服务开始日期 YYYY-MM-DD
  serviceEnd?: string;          // 服务结束日期 YYYY-MM-DD
}

/** 事项（完成/计划） */
export interface ReportItem {
  id: string;
  order: number;
  title: string;        // 项目名称
  progress?: string;    // 项目进展
  acceptance?: string;  // 验收资料进展
  detail?: string;      // 保留兼容旧数据
  reason?: string;      // 未完成原因（仅计划事项）
  carriedForward?: boolean; // 是否已从上周带入并确认完成（标记后不再计入剩余）
}

/** 风险提示 */
export interface Risk {
  id: string;
  order: number;
  description: string;   // 风险描述
  suggestion: string;    // 解决建议
  level: '高' | '中' | '低';
  status: '待处理' | '已解决' | '持续关注';
  resolvedAt?: string;   // 确认不属于风险的处理时间
}

/** 周报 */
export interface WeeklyReport {
  id: string;
  projectId: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  updatedAt: string;
  goals: string;               // 建设目标
  highlights: string;          // 重点内容
  summary?: string;            // 保留兼容旧数据
  progress: number;            // 当前完成进度 0-100，负责人手动填写
  completedItems: ReportItem[];
  plannedItems: ReportItem[];
  risks: Risk[];
}

/** 登录认证 */
export interface AuthState {
  isLoggedIn: boolean;
  username: string;
}

/** 应用全局数据 */
export interface AppData {
  projects: Project[];
  reports: WeeklyReport[];
}
