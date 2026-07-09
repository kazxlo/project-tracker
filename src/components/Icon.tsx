import {
  LayoutDashboard,
  Users,
  BarChart3,
  TrendingUp,
  Settings,
  AlertTriangle,
  Zap,
  Lightbulb,
  Clock,
  Eye,
  Check,
  FileText,
  Paperclip,
  Diamond,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  LogOut,
  Plus,
  Trash2,
  Download,
  X,
  Calendar,
  Target,
  Search,
  Bell,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  workspace: Users,
  cockpit: BarChart3,
  trends: TrendingUp,
  admin: Settings,
  alert: AlertTriangle,
  zap: Zap,
  lightbulb: Lightbulb,
  clock: Clock,
  eye: Eye,
  check: Check,
  fileText: FileText,
  paperclip: Paperclip,
  diamond: Diamond,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronsLeft: ChevronsLeft,
  logout: LogOut,
  plus: Plus,
  trash: Trash2,
  download: Download,
  close: X,
  calendar: Calendar,
  target: Target,
  search: Search,
  bell: Bell,
  sun: Sun,
  moon: Moon,
};

export const IconNames = Object.keys(iconMap) as (keyof typeof iconMap)[];

interface IconProps {
  name: keyof typeof iconMap;
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 16, color, className, strokeWidth = 2 }: IconProps) {
  const Component = iconMap[name];
  if (!Component) return null;
  return <Component size={size} color={color} className={className} strokeWidth={strokeWidth} />;
}
