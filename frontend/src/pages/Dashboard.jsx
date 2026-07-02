import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, Users, TrendingUp, CheckCircle2, Clock, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { dashboard, posts, clients as clientsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PlatformIcon from '../components/PlatformIcon';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function Dashboard() {
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [recentPosts, setPosts] = useState([]);
  const [clientList, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      dashboard.stats(),
      posts.list(),
      clientsApi.list(),
    ])
      .then(([s, p, c]) => {
        setStats(s);
        // API returns paginated or plain array — handle both
        const postArr = Array.isArray(p) ? p : (p.results ?? []);
        setPosts(postArr.slice(0, 3));
        const clientArr = Array.isArray(c) ? c : (c.results ?? []);
        setClients(clientArr);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  const statCards = stats ? [
    {
      label: 'Total Clients',
      value: stats.total_clients,
      sub: 'connected brands',
      icon: Users,
      to: '/clients',
      color: 'text-brand-400',
      bg: 'bg-brand-600/10',
    },
    {
      label: 'Posts Published',
      value: stats.posts_this_month,
      sub: 'this month',
      icon: Send,
      to: '/history',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Accounts Reached',
      value: stats.connected_accounts,
      sub: 'social accounts',
      icon: TrendingUp,
      to: '/clients',
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
    },
    {
      label: 'Delivery Rate',
      value: stats.delivery_rate,
      sub: 'successful delivers',
      icon: CheckCircle2,
      to: '/history',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
  ] : [];

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold" style={{ fontFamily: "'Dancing Script', cursive", fontSize: '2.2rem' }}>
            <span className="text-brand-400">H</span>
            <span className="text-white">ellooo!!! 👋</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {user?.organization?.name} · {new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link
          to="/compose"
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Send size={15} />
          New Post
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-surface-border rounded-2xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {statCards.map(({ label, value, sub, icon: Icon, color, bg, to }) => (
            <Link key={label} to={to} className="bg-surface-card border border-surface-border rounded-2xl p-5 hover:border-brand-600/30 hover:bg-surface-hover transition-all cursor-pointer block">
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-4`}>
                <Icon size={18} className={color} />
              </div>
              <p className={`text-2xl font-bold ${color} font-display`}>{value}</p>
              <p className="text-white text-sm font-medium mt-0.5">{label}</p>
              <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Recent Posts */}
        <div className="col-span-3 bg-surface-card border border-surface-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-white">Recent Posts</h2>
            <Link to="/history" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              View all <ExternalLink size={11} />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-surface-hover animate-pulse" />
              ))}
            </div>
          ) : recentPosts.length === 0 ? (
            <div className="py-10 text-center">
              <Send size={24} className="text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No posts yet.</p>
              <Link to="/compose" className="text-xs text-brand-400 hover:text-brand-300 mt-1 inline-block">
                Create your first post →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPosts.map(post => {
                // Collect unique client names from distributions
                const clientNames = [...new Set(
                  (post.distributions || []).map(d => d.client_name).filter(Boolean)
                )];
                return (
                  <div key={post.id} className="p-4 rounded-xl bg-surface-hover border border-surface-border/50 hover:border-brand-600/30 transition-colors">
                    <p className="text-sm text-slate-300 line-clamp-1">{post.content}</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {clientNames.length > 0
                          ? clientNames.map(name => (
                            <span key={name} className="px-2 py-0.5 rounded-md bg-surface-card border border-surface-border text-[10px] text-slate-400">
                              {name}
                            </span>
                          ))
                          : <span className="text-[10px] text-slate-600">No distributions</span>
                        }
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0 ml-3">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-500" /> {post.success_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {timeAgo(post.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Client Summary */}
        <div className="col-span-2 bg-surface-card border border-surface-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-white">Clients</h2>
            <span className="text-xs text-slate-500">
              {clientList.reduce((s, c) => s + (c.connected_count || 0), 0)} accounts linked
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-surface-hover animate-pulse" />
              ))}
            </div>
          ) : clientList.length === 0 ? (
            <div className="py-10 text-center">
              <Users size={24} className="text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">No clients yet.</p>
              <Link to="/clients" className="text-xs text-brand-400 hover:text-brand-300 mt-1 inline-block">
                Add your first client →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {clientList.map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-hover">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: client.color + '33', color: client.color }}
                    >
                      {client.logo_initials}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white">{client.name}</p>
                      <p className="text-[10px] text-slate-500">{client.industry}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(client.accounts || []).map(acc => (
                      <span
                        key={acc.id}
                        className={`w-5 h-5 rounded-md flex items-center justify-center bg-surface-card ${!acc.is_connected && 'opacity-20'}`}
                      >
                        <PlatformIcon platform={acc.platform} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}