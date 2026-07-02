import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Send,
  Users,
  FileText,
  Settings,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/compose', label: 'New Post', icon: Send },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/history', label: 'History', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { user } = useAuth();
  const organization = user?.organization || { name: '', logo_initials: '', plan: '' };

  return (
    <aside className="w-60 min-h-screen bg-surface-card border-r border-surface-border flex flex-col">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white font-display">BrandHub</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">by {organization.name}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${isActive
                ? 'bg-brand-600/20 text-brand-400 font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Org badge */}
      <div className="p-3 m-3 rounded-xl bg-surface-hover border border-surface-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-brand-900 border border-brand-600/30 flex items-center justify-center">
            <span className="text-[9px] font-bold text-brand-400 font-mono">{organization.logo_initials}</span>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-200">{organization.name}</p>
            <p className="text-[10px] text-slate-500">{organization.plan} Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
