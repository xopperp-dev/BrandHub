import { useState, useEffect, useCallback } from 'react';
import { clients as clientsApi, accounts as accountsApi } from '../api/client';
import PlatformIcon from '../components/PlatformIcon';
import ConnectModal from '../components/ConnectModal';
import {
  Plus, CheckCircle2, X,
  Trash2, Edit2, AlertTriangle, Eye, EyeOff,
  Loader2, AlertCircle, Search, ExternalLink
} from 'lucide-react';

const platformLabels = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
};

const platformColors = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  linkedin: '#0A66C2',
  x: '#ffffff',
};

// Modal: Disconnect confirmation
function DisconnectModal({ client, account, onClose, onConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleConfirm = async () => {
    setLoading(true);
    setErr('');
    try {
      await accountsApi.disconnect(client.id, account.id);
      onConfirmed();
      onClose();
    } catch (e) {
      setErr('Failed to disconnect. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} className="text-red-400" />
          </div>
          <p className="text-white font-semibold mb-1">Disconnect account?</p>
          <p className="text-sm text-slate-400 mb-1">
            <span className="text-white">{account.handle || account.page_id || platformLabels[account.platform]}</span> will be unlinked from <span className="text-white">{client.name}</span>.
          </p>
          <p className="text-xs text-slate-600 mb-4">Future posts won't be sent to this account.</p>
          {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 rounded-xl border border-surface-border text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-sm text-red-400 hover:bg-red-500/30 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal: Add new client
function AddClientModal({ onClose, onSaved }) {
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316'];
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [color, setColor] = useState(colors[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const logo = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setErr('');
    try {
      const created = await clientsApi.create({
        name: name.trim(),
        industry: industry.trim() || 'General',
        color,
        logo_initials: logo,
      });
      onSaved(created);
      onClose();
    } catch (e) {
      setErr(e.data?.detail || 'Failed to create client.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <p className="text-sm font-semibold text-white">Add New Client</p>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: color + '33', color }}>
              {logo}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{name || 'Client Name'}</p>
              <p className="text-xs text-slate-500">{industry || 'Industry'}</p>
            </div>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Client / Brand Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. KIF Realty"
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Industry</label>
            <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Real Estate"
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Brand Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={!name.trim() || loading}
            className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Add Client
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal: Delete client confirmation
function DeleteClientModal({ client, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    try {
      await clientsApi.remove(client.id);
      onDeleted(client.id);
      onClose();
    } catch {
      setErr('Failed to delete. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={22} className="text-red-400" />
        </div>
        <p className="text-white font-semibold mb-1">Remove {client.name}?</p>
        <p className="text-sm text-slate-400 mb-4">This will disconnect all linked accounts and cannot be undone.</p>
        {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2 rounded-xl border border-surface-border text-sm text-slate-400 hover:text-white transition-all disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={loading}
            className="flex-1 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-sm text-red-400 hover:bg-red-500/30 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50">
            {loading && <Loader2 size={13} className="animate-spin" />}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal: Edit existing client
function EditClientModal({ client, onClose, onSaved }) {
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#f97316'];
  const [name, setName] = useState(client.name || '');
  const [industry, setIndustry] = useState(client.industry || '');
  const [color, setColor] = useState(client.color || colors[0]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const logo = name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setErr('');
    try {
      const updated = await clientsApi.update(client.id, {
        name: name.trim(),
        industry: industry.trim() || 'General',
        color,
        logo_initials: logo,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setErr(e.data?.detail || 'Failed to update client.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <p className="text-sm font-semibold text-white">Edit Client</p>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-hover">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: color + '33', color }}>
              {logo}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{name || 'Client Name'}</p>
              <p className="text-xs text-slate-500">{industry || 'Industry'}</p>
            </div>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Client / Brand Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. KIF Realty"
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Industry</label>
            <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Real Estate"
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Brand Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm text-slate-400 hover:text-white transition-all disabled:opacity-50">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!name.trim() || loading}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Clients() {
  const [clientList, setClientList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [connectModal, setConnectModal] = useState(null);   // { client, account }
  const [disconnectModal, setDisconnectModal] = useState(null);
  const [addClientModal, setAddClientModal] = useState(false);
  const [deleteClientModal, setDeleteClientModal] = useState(null);
  const [editClientModal, setEditClientModal] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await clientsApi.list();
      const arr = Array.isArray(data) ? data : (data.results ?? []);
      setClientList(arr);
    } catch {
      setError('Failed to load clients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const filtered = clientList.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase())
  );

  // After account connect: update that account in-place
  const handleAccountSaved = (clientId, updatedAcc) => {
    setClientList(prev => prev.map(c =>
      c.id === clientId
        ? { ...c, accounts: c.accounts.map(a => a.id === updatedAcc.id ? updatedAcc : a) }
        : c
    ));
  };

  // After disconnect: mark account disconnected in-place
  const handleAccountDisconnected = (clientId, accId) => {
    setClientList(prev => prev.map(c =>
      c.id === clientId
        ? { ...c, accounts: c.accounts.map(a => a.id === accId ? { ...a, is_connected: false, handle: '' } : a) }
        : c
    ));
  };

  const handleClientAdded = (newClient) => {
    setClientList(prev => [...prev, newClient]);
  };

  const handleClientUpdated = (updatedClient) => {
    setClientList(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
  };

  const handleClientDeleted = (clientId) => {
    setClientList(prev => prev.filter(c => c.id !== clientId));
  };

  return (
    <div className="p-8">
      {/* Modals */}
      {connectModal && (
        <ConnectModal
          client={connectModal.client}
          account={connectModal.account}
          onClose={() => setConnectModal(null)}
          onSaved={(updatedAcc) => {
            handleAccountSaved(connectModal.client.id, updatedAcc);
            setConnectModal(null);
          }}
        />
      )}
      {disconnectModal && (
        <DisconnectModal
          client={disconnectModal.client}
          account={disconnectModal.account}
          onClose={() => setDisconnectModal(null)}
          onConfirmed={() => handleAccountDisconnected(disconnectModal.client.id, disconnectModal.account.id)}
        />
      )}
      {addClientModal && (
        <AddClientModal onClose={() => setAddClientModal(false)} onSaved={handleClientAdded} />
      )}
      {editClientModal && (
        <EditClientModal
          client={editClientModal}
          onClose={() => setEditClientModal(null)}
          onSaved={(updated) => { handleClientUpdated(updated); setEditClientModal(null); }}
        />
      )}
      {deleteClientModal && (
        <DeleteClientModal
          client={deleteClientModal}
          onClose={() => setDeleteClientModal(null)}
          onDeleted={handleClientDeleted}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white font-display">Clients</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage client brands and their connected social accounts.</p>
        </div>
        <button
          onClick={() => setAddClientModal(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={15} />
          Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs mb-5">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full bg-surface-card border border-surface-border rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={15} /> {error}
          <button onClick={fetchClients} className="ml-auto text-xs text-brand-400 hover:text-brand-300">Retry</button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <div className="grid grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface-card border border-surface-border rounded-2xl p-6 animate-pulse h-64" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {filtered.map(client => {
            const connected = (client.accounts || []).filter(a => a.is_connected).length;
            const total = (client.accounts || []).length;

            return (
              <div key={client.id} className="bg-surface-card border border-surface-border rounded-2xl p-6 hover:border-brand-600/30 transition-colors group">
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{ background: (client.color || '#6366f1') + '22', color: client.color || '#6366f1' }}>
                      {client.logo_initials || client.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.industry}</p>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <button
                      onClick={() => setEditClientModal(client)}
                      className="text-slate-600 hover:text-brand-400 p-1 rounded-lg hover:bg-brand-600/10 transition-all"
                      title="Edit client"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteClientModal(client)}
                      className="text-slate-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                      title="Remove client"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Accounts */}
                <div className="space-y-2">
                  {(client.accounts || []).map(acc => (
                    <div key={acc.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${acc.is_connected
                        ? 'bg-surface-hover border-surface-border'
                        : 'bg-surface-hover/40 border-dashed border-surface-border/60'
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${!acc.is_connected && 'opacity-40'}`}
                          style={{ background: (platformColors[acc.platform] || '#6366f1') + '18' }}>
                          <PlatformIcon platform={acc.platform} />
                        </div>
                        <div>
                          <p className={`text-xs font-medium ${acc.is_connected ? 'text-white' : 'text-slate-600'}`}>
                            {platformLabels[acc.platform] || acc.platform}
                          </p>
                          {acc.is_connected && (acc.handle || acc.page_id) && (
                            <p className="text-[10px] text-slate-500">{acc.handle || acc.page_id}</p>
                          )}
                          {acc.is_connected && acc.profile_url && (
                            <a
                              href={acc.profile_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
                            >
                              <ExternalLink size={9} />
                              View page
                            </a>
                          )}
                        </div>
                      </div>

                      {acc.is_connected ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] text-emerald-400 font-medium">Live</span>
                          </div>
                          <button
                            onClick={() => setConnectModal({ client, account: acc })}
                            className="p-1.5 rounded-lg hover:bg-surface-card text-slate-500 hover:text-slate-300 transition-all"
                            title="Edit credentials"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            onClick={() => setDisconnectModal({ client, account: acc })}
                            className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-all"
                            title="Disconnect"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConnectModal({ client, account: acc })}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-600/10 border border-brand-600/30 hover:bg-brand-600/20 text-[11px] text-brand-400 font-medium transition-all"
                        >
                          <Plus size={10} />
                          Connect
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-4 pt-4 border-t border-surface-border flex items-center justify-between">
                  <span className="text-xs text-slate-500">{connected}/{total} connected</span>
                  <div className="flex gap-1">
                    {Array.from({ length: total }).map((_, i) => (
                      <div key={i} className={`w-6 h-1 rounded-full transition-all ${i < connected ? 'bg-emerald-400' : 'bg-surface-border'}`} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty add card */}
          <button
            onClick={() => setAddClientModal(true)}
            className="border-2 border-dashed border-surface-border rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:border-brand-600/40 hover:bg-brand-600/5 transition-all group min-h-48"
          >
            <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-700 group-hover:border-brand-600/50 flex items-center justify-center transition-all">
              <Plus size={18} className="text-slate-600 group-hover:text-brand-400 transition-colors" />
            </div>
            <p className="text-sm text-slate-600 group-hover:text-slate-400 transition-colors font-medium">Add new client</p>
          </button>
        </div>
      )}
    </div>
  );
}