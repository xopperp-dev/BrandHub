import { useState, useEffect, useMemo, useCallback } from 'react';
import { posts as postsApi } from '../api/client';
import PlatformIcon from '../components/PlatformIcon';
import {
  CheckCircle2, TrendingUp, Users, Search, Filter,
  ChevronDown, ChevronUp, Trash2, X, RotateCcw,
  CheckCheck, AlertCircle, Clock, Loader2
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_STYLES = {
  published: { label: 'Published', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', Icon: CheckCircle2 },
  partial: { label: 'Partial', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', Icon: AlertCircle },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', Icon: X },
  draft: { label: 'Draft', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', Icon: Clock },
};

const DIST_STATUS = {
  success: { color: 'text-emerald-400', Icon: CheckCheck },
  failed: { color: 'text-red-400', Icon: X },
};

// ── Normalise API post → UI shape ──────────────────────────────────────────────
function normalisePost(post) {
  // distributions come from API as: [{ id, status, account: { id, platform, handle, client: { name, color } } }]
  const dists = post.distributions || [];
  const clientNames = [...new Set(dists.map(d => d.account?.client?.name).filter(Boolean))];
  const clientColors = {};
  dists.forEach(d => {
    if (d.account?.client) clientColors[d.account.client.name] = d.account.client.color;
  });
  const accounts = dists.map(d => ({
    platform: d.account?.platform,
    handle: d.account?.handle || '',
    status: d.status,
    clientName: d.account?.client?.name,
    clientColor: d.account?.client?.color,
  }));
  return {
    ...post,
    clients: clientNames,
    clientColors,
    accounts,
    distributions: dists.length,
    // API uses created_at; keep both
    createdAt: post.created_at || post.createdAt,
  };
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function DeleteModal({ post, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <Trash2 size={16} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-white">Delete post?</p>
        </div>
        <p className="text-sm text-slate-400 mb-5 line-clamp-2">"{post.content}"</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm text-slate-400 hover:text-white transition-all">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function History() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [expanded, setExpanded] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState('');

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await postsApi.list();
      const arr = Array.isArray(data) ? data : (data.results ?? []);
      setPosts(arr.map(normalisePost));
    } catch {
      setError('Failed to load post history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const allClientNames = useMemo(
    () => [...new Set(posts.flatMap(p => p.clients))].sort(),
    [posts]
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // ── Filter + sort ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = posts.filter(p => {
      const matchSearch = !search || p.content.toLowerCase().includes(search.toLowerCase());
      const matchClient = filterClient === 'all' || p.clients.includes(filterClient);
      const matchStatus = filterStatus === 'all' || p.status === filterStatus;
      return matchSearch && matchClient && matchStatus;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'date_asc') return new Date(a.createdAt) - new Date(b.createdAt);
      return 0;
    });
    return list;
  }, [posts, search, filterClient, filterStatus, sortBy]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const totalDists = posts.reduce((s, p) => s + (p.distributions || 0), 0);

  const confirmDelete = () => {
    // Soft-delete: remove from UI (no delete endpoint in current API)
    setPosts(prev => prev.filter(p => p.id !== deleteTarget.id));
    if (expanded === deleteTarget.id) setExpanded(null);
    setDeleteTarget(null);
    showToast('Post removed from view.');
  };

  const resetFilters = () => {
    setSearch(''); setFilterClient('all'); setFilterStatus('all'); setSortBy('date_desc');
  };
  const hasActiveFilters = search || filterClient !== 'all' || filterStatus !== 'all' || sortBy !== 'date_desc';

  return (
    <div className="p-8">
      {deleteTarget && <DeleteModal post={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-surface-card border border-surface-border text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white font-display">Post History</h1>
        <p className="text-slate-400 text-sm mt-0.5">All published distributions across your clients.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Posts Published',
            value: posts.length,
            icon: CheckCircle2,
            color: 'text-emerald-400',
            activeBg: 'bg-emerald-500/10 border-emerald-500/30',
            hint: 'Show all posts',
            onClick: () => { setFilterStatus('all'); setSearch(''); },
            active: filterStatus === 'all' && !search,
          },
          {
            label: 'Total Distributions',
            value: totalDists,
            icon: Users,
            color: 'text-brand-400',
            activeBg: 'bg-brand-600/10 border-brand-600/30',
            hint: 'Show published only',
            onClick: () => { setFilterStatus('published'); setSearch(''); },
            active: filterStatus === 'published',
          },
          {
            label: 'Success Rate',
            value: (() => {
              const total = posts.reduce((s, p) => s + (p.distributions || 0), 0);
              const ok = posts.reduce((s, p) => s + (p.success_count || 0), 0);
              return total ? `${Math.round(ok / total * 100)}%` : '—';
            })(),
            icon: TrendingUp,
            color: 'text-violet-400',
            activeBg: 'bg-violet-500/10 border-violet-500/30',
            hint: 'Show partial / failed',
            onClick: () => { setFilterStatus('partial'); setSearch(''); },
            active: filterStatus === 'partial' || filterStatus === 'failed',
          },
        ].map(({ label, value, icon: Icon, color, activeBg, hint, onClick, active }) => (
          <button
            key={label}
            onClick={onClick}
            title={hint}
            className={`text-left w-full px-5 py-4 rounded-xl border flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-100 ${active
                ? `${activeBg} shadow-sm`
                : 'bg-surface-card border-surface-border hover:border-slate-600'
              }`}
          >
            <Icon size={18} className={color} />
            <div>
              <p className={`text-xl font-bold font-display ${color}`}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
            {active && (
              <span className="ml-auto text-[10px] text-slate-500 font-medium">active filter</span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={15} /> {error}
          <button onClick={fetchPosts} className="ml-auto text-xs text-brand-400 hover:text-brand-300">Retry</button>
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search posts…"
            className="w-full bg-surface-card border border-surface-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all ${showFilters || hasActiveFilters ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'bg-surface-card border-surface-border text-slate-400 hover:text-white'}`}>
          <Filter size={14} />
          Filters
          {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
        </button>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-sm text-slate-400 focus:outline-none focus:border-brand-500/60 transition-colors cursor-pointer">
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
        </select>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Client</p>
            <div className="flex gap-1.5 flex-wrap">
              {['all', ...allClientNames].map(name => (
                <button key={name} onClick={() => setFilterClient(name)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${filterClient === name
                    ? 'bg-brand-600/20 border-brand-600/50 text-brand-400'
                    : 'border-surface-border text-slate-500 hover:text-slate-300'}`}>
                  {name === 'all' ? 'All clients' : name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Status</p>
            <div className="flex gap-1.5">
              {['all', 'published', 'partial', 'failed'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border capitalize ${filterStatus === s
                    ? 'bg-brand-600/20 border-brand-600/50 text-brand-400'
                    : 'border-surface-border text-slate-500 hover:text-slate-300'}`}>
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
          </div>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              <RotateCcw size={11} /> Reset
            </button>
          )}
        </div>
      )}

      {hasActiveFilters && (
        <p className="text-xs text-slate-500 mb-3">
          Showing <span className="text-white font-medium">{filtered.length}</span> of {posts.length} posts
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-surface-card border border-surface-border rounded-2xl">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`h-16 animate-pulse bg-surface-hover/40 ${i < 3 ? 'border-b border-surface-border' : ''}`} />
          ))}
        </div>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border grid grid-cols-12 text-[10px] uppercase tracking-wider text-slate-600 font-medium">
            <div className="col-span-4">Content</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Clients</div>
            <div className="col-span-1 text-right">Sent to</div>
            <div className="col-span-1 text-right">Success</div>
            <div className="col-span-2 text-right">Time</div>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Search size={28} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">{posts.length === 0 ? 'No posts published yet.' : 'No posts match your filters.'}</p>
              {hasActiveFilters && (
                <button onClick={resetFilters} className="mt-3 text-xs text-brand-400 hover:text-brand-300">Reset filters</button>
              )}
            </div>
          ) : (
            filtered.map((post, i) => {
              const isExpanded = expanded === post.id;
              const st = STATUS_STYLES[post.status] || STATUS_STYLES.published;
              const StatusIcon = st.Icon;

              return (
                <div key={post.id} className={i < filtered.length - 1 ? 'border-b border-surface-border' : ''}>
                  <div
                    className="px-5 py-4 grid grid-cols-12 items-start gap-2 hover:bg-surface-hover transition-colors cursor-pointer group"
                    onClick={() => setExpanded(isExpanded ? null : post.id)}
                  >
                    <div className="col-span-4 flex items-start gap-2">
                      <div className="mt-0.5 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </div>
                      <p className="text-sm text-slate-300 line-clamp-2">{post.content}</p>
                    </div>

                    <div className="col-span-2 pt-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium ${st.bg} ${st.color}`}>
                        <StatusIcon size={9} />
                        {st.label}
                      </span>
                    </div>

                    <div className="col-span-2 flex flex-wrap gap-1 pt-0.5">
                      {post.clients.map(name => (
                        <span key={name} className="px-2 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: (post.clientColors?.[name] || '#6366f1') + '22', color: post.clientColors?.[name] || '#818cf8' }}>
                          {name}
                        </span>
                      ))}
                    </div>

                    <div className="col-span-1 text-right">
                      <span className="text-sm text-white font-medium">{post.distributions}</span>
                      <p className="text-[10px] text-slate-600">accounts</p>
                    </div>

                    <div className="col-span-1 text-right">
                      <span className="text-sm text-white font-medium">{post.success_count ?? '—'}</span>
                      <p className="text-[10px] text-slate-600">ok</p>
                    </div>

                    <div className="col-span-2 text-right flex flex-col items-end gap-1">
                      <p className="text-xs text-slate-400">{timeAgo(post.createdAt)}</p>
                      <p className="text-[10px] text-slate-600">{formatDate(post.createdAt)}</p>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(post); }}
                        className="mt-1 p-1 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-surface-hover/40 border-t border-surface-border">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-medium mb-3">Distribution Results</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {post.accounts.map((acc, idx) => {
                          const ds = DIST_STATUS[acc.status] || DIST_STATUS.success;
                          const DIcon = ds.Icon;
                          return (
                            <div key={idx} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${acc.status === 'success'
                              ? 'bg-surface-card border-surface-border'
                              : 'bg-red-500/5 border-red-500/20'}`}>
                              <PlatformIcon platform={acc.platform} />
                              <div className="flex-1 min-w-0">
                                <p className="text-slate-300 truncate">{acc.handle || acc.clientName}</p>
                                <p className={`text-[10px] capitalize ${ds.color}`}>{acc.status}</p>
                              </div>
                              <DIcon size={12} className={ds.color} />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 p-3 rounded-xl bg-surface-card border border-surface-border">
                        <p className="text-xs text-slate-500 mb-1">Full content</p>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{post.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}