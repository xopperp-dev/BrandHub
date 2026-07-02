import { useState } from 'react';
import { Bell, Shield, Palette, Link2, User, ChevronRight, ChevronLeft, Check, Moon, Sun, Monitor, Loader2, LogOut } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../api/client';
import { useNavigate } from 'react-router-dom';

// ── Sub-page: Organization Profile ──────────────────────────────────────────
function OrgProfilePanel() {
  const { user, updateUser } = useAuth();
  const org = user?.organization;

  const [name, setName] = useState(org?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const updated = await auth.updateOrg({ name: name.trim() });
      updateUser({ organization: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err?.data?.detail || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const initials = org?.logo_initials || name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3) || '?';

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Organization Name</label>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setSaved(false); }}
          className="w-full bg-surface-hover border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Plan</label>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-hover border border-surface-border rounded-lg">
          <span className="text-sm text-white capitalize">{org?.plan || 'starter'} Plan</span>
          <span className="ml-auto text-xs text-brand-400 bg-brand-900 px-2 py-0.5 rounded-full">Active</span>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Logo Initials</label>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-900 border border-brand-600/30 flex items-center justify-center">
            <span className="text-sm font-bold text-brand-400 font-mono">{initials}</span>
          </div>
          <span className="text-xs text-slate-500">Auto-generated from organization name</span>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Your Account</label>
        <div className="px-3 py-2.5 bg-surface-hover border border-surface-border rounded-lg space-y-1">
          <p className="text-sm text-white">{user?.full_name || user?.first_name}</p>
          <p className="text-xs text-slate-500">{user?.email}</p>
          <span className="inline-block text-[10px] text-brand-400 bg-brand-900 px-2 py-0.5 rounded-full capitalize">{user?.role?.replace('_', ' ')}</span>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}

// ── Sub-page: API Connections ────────────────────────────────────────────────
function ApiConnectionsPanel() {
  // This shows platform-level info — actual per-client tokens are managed in the Clients page
  const platforms = [
    { name: 'Facebook / Instagram', abbr: 'Meta', note: 'Manage tokens per client in the Clients page', color: '#1877F2' },
    { name: 'LinkedIn', abbr: 'LI', note: 'Manage tokens per client in the Clients page', color: '#0A66C2' },
    { name: 'X (Twitter)', abbr: 'X', note: 'Manage tokens per client in the Clients page', color: '#ffffff' },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 mb-4">
        Social account tokens are connected per-client. Go to <span className="text-brand-400">Clients → Connect</span> to add or update tokens for each brand.
      </p>
      {platforms.map(({ name, abbr, note, color }) => (
        <div key={name} className="flex items-center gap-4 p-4 bg-surface-hover rounded-xl border border-surface-border">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: color + '22' }}>
            <span className="text-[10px] font-bold" style={{ color }}>{abbr}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{name}</p>
            <p className="text-xs text-slate-500">{note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sub-page: Notifications ──────────────────────────────────────────────────
function NotificationsPanel() {
  const [settings, setSettings] = useState({
    publishSuccess: true,
    publishFailure: true,
    weeklyDigest: false,
    clientActivity: true,
  });

  const toggle = key => setSettings(s => ({ ...s, [key]: !s[key] }));

  const items = [
    { key: 'publishSuccess', label: 'Publish success', desc: 'When a post is successfully published' },
    { key: 'publishFailure', label: 'Publish failure', desc: 'When a scheduled post fails' },
    { key: 'weeklyDigest', label: 'Weekly digest', desc: 'Summary of activity every Monday' },
    { key: 'clientActivity', label: 'Client activity', desc: 'When a client account is connected or removed' },
  ];

  return (
    <div className="space-y-2">
      {items.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center justify-between p-4 bg-surface-hover rounded-xl border border-surface-border">
          <div>
            <p className="text-sm font-medium text-white">{label}</p>
            <p className="text-xs text-slate-500">{desc}</p>
          </div>
          <button
            onClick={() => toggle(key)}
            style={{ width: 40, height: 22, background: settings[key] ? '#4f46e5' : '#374151' }}
            className="relative rounded-full transition-colors shrink-0"
          >
            <span
              className="absolute top-0.5 bg-white rounded-full transition-transform"
              style={{ width: 18, height: 18, left: 2, transform: settings[key] ? 'translateX(18px)' : 'translateX(0)' }}
            />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Sub-page: Security ───────────────────────────────────────────────────────
function SecurityPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-surface-hover rounded-xl border border-surface-border space-y-3">
        <p className="text-sm font-medium text-white">Signed in as</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-300">{user?.full_name || user?.first_name}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          <span className="text-xs text-brand-400 bg-brand-900 px-2 py-0.5 rounded-full capitalize">
            {user?.role?.replace('_', ' ')}
          </span>
        </div>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-hover border border-surface-border hover:border-red-500/40 hover:bg-red-500/5 text-slate-400 hover:text-red-400 text-sm rounded-xl transition-all"
      >
        {loggingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <div className="p-4 bg-red-900/10 rounded-xl border border-red-900/30">
        <p className="text-sm font-medium text-red-400 mb-1">Danger zone</p>
        <p className="text-xs text-slate-500 mb-3">Permanently delete this organization and all data.</p>
        <button className="text-xs px-3 py-1.5 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg transition-colors">
          Delete Organization
        </button>
      </div>
    </div>
  );
}

// ── Sub-page: Appearance ─────────────────────────────────────────────────────
function AppearancePanel() {
  const { theme, changeTheme } = useTheme();
  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-400 mb-3">Theme</p>
        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => changeTheme(id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === id
                ? 'border-brand-500 bg-brand-600/10 text-brand-400'
                : 'border-surface-border bg-surface-hover text-slate-400 hover:border-slate-600'
                }`}
            >
              <Icon size={18} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">Saved automatically and restored on next visit.</p>
      </div>

      <div className="p-4 bg-surface-hover rounded-xl border border-surface-border">
        <p className="text-sm font-medium text-white mb-1">Compact mode</p>
        <p className="text-xs text-slate-500">Reduce spacing for denser layouts — coming soon.</p>
      </div>
    </div>
  );
}

// ── Main Settings page ───────────────────────────────────────────────────────
const sections = [
  { id: 'profile', icon: User, label: 'Organization Profile', desc: 'Name, logo, and plan details', Panel: OrgProfilePanel },
  { id: 'api', icon: Link2, label: 'API Connections', desc: 'Manage social platform tokens', Panel: ApiConnectionsPanel },
  { id: 'notifications', icon: Bell, label: 'Notifications', desc: 'Publish alerts and failure emails', Panel: NotificationsPanel },
  { id: 'security', icon: Shield, label: 'Security', desc: 'Sign out and account control', Panel: SecurityPanel },
  { id: 'appearance', icon: Palette, label: 'Appearance', desc: 'Theme and display preferences', Panel: AppearancePanel },
];

export default function Settings() {
  const { user } = useAuth();
  const org = user?.organization;
  const [active, setActive] = useState(null);
  const section = sections.find(s => s.id === active);

  const initials = org?.logo_initials || '?';

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        {active && (
          <button
            onClick={() => setActive(null)}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-hover hover:bg-surface-border transition-colors"
          >
            <ChevronLeft size={15} className="text-slate-400" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-white font-display">
            {section ? section.label : 'Settings'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {section ? section.desc : 'Manage your organization and platform configuration.'}
          </p>
        </div>
      </div>

      {section ? (
        <section.Panel />
      ) : (
        <>
          {/* Org card */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5 mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-900 border border-brand-600/30 flex items-center justify-center">
                <span className="text-sm font-bold text-brand-400 font-mono">{initials}</span>
              </div>
              <div>
                <p className="font-semibold text-white">{org?.name || '—'}</p>
                <p className="text-xs text-slate-500 capitalize">
                  Organization · {org?.plan || 'starter'} Plan
                </p>
              </div>
              <button
                onClick={() => setActive('profile')}
                className="ml-auto text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Settings list */}
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden divide-y divide-surface-border">
            {sections.map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center">
                    <Icon size={15} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                </div>
                <ChevronRight size={15} className="text-slate-600" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}