import {
  LayoutDashboard,
  FileUp,
  Ticket,
  Code2,
  FileText,
  History,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type PageId =
  | 'dashboard'
  | 'brd'
  | 'tests'
  | 'docs'
  | 'history'
  | 'settings';

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'brd', label: 'BRD Upload', icon: FileUp },
  { id: 'tests', label: 'Unit Test Generator', icon: Code2 },
  { id: 'docs', label: 'Documentation Generator', icon: FileText },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];
