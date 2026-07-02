import { useState, useEffect, useRef, useCallback } from 'react';
import { clients as clientsApi, posts as postsApi, media as mediaApi } from '../api/client';
import PlatformIcon from '../components/PlatformIcon';
import {
  Image, Link2, Smile, ChevronDown, ChevronUp,
  CheckCheck, X, Send, AlertCircle, Loader2, Minus, Paperclip
} from 'lucide-react';

const MAX_CHARS = 1500;

const EMOJIS = [
  '😀', '😂', '🥰', '😎', '🤔', '🙌', '👏', '🔥', '💡', '✅',
  '🚀', '💼', '📢', '🎯', '📊', '💰', '🏆', '⭐', '❤️', '👍',
  '😍', '😘', '🤗', '🫶🏻', '👋🏻', '🗣️', '🥱', '🤑', '💯', '✍🏻',
];

export default function Compose() {
  // ── Client data from API ───────────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState('');

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError('');
    try {
      const data = await clientsApi.list();
      const arr = Array.isArray(data) ? data : (data.results ?? []);
      setClients(arr);
    } catch {
      setClientsError('Failed to load clients. Please refresh.');
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // ── Compose state ──────────────────────────────────────────────────────────
  const [content, setContent] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState({});
  const [expandedClients, setExpandedClients] = useState({});
  const [publishState, setPublishState] = useState('idle'); // idle | publishing | done | error
  const [results, setResults] = useState(null); // API response post
  const [publishError, setPublishError] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [attachments, setAttachments] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialise selected accounts when clients load
  useEffect(() => {
    if (clients.length === 0) return;
    const sel = {};
    const exp = {};
    clients.forEach(c => {
      exp[c.id] = true;
      (c.accounts || []).forEach(a => { sel[a.id] = !!a.is_connected; });
    });
    setSelectedAccounts(sel);
    setExpandedClients(exp);
  }, [clients]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const insertAtCursor = (text) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const handleEmojiClick = (emoji) => { insertAtCursor(emoji); setShowEmojis(false); };

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    insertAtCursor(` ${url} `);
    setLinkUrl('');
    setShowLinkModal(false);
  };

  const handleImageUpload = (e) => {
    Array.from(e.target.files).forEach(file => {
      // Show an immediate local preview (data URL) while the real upload runs —
      // but `url` stays null until the server hands back a public URL. Facebook
      // and Instagram fetch images by URL server-side, so a data:/blob: URL
      // published as-is would never actually attach an image to the post.
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          previewUrl: ev.target.result,
          url: null,
          uploading: true,
          error: null,
        }]);

        mediaApi.upload(file)
          .then(({ url }) => {
            setAttachments(prev => prev.map(a =>
              a.name === file.name ? { ...a, url, uploading: false } : a
            ));
          })
          .catch(() => {
            setAttachments(prev => prev.map(a =>
              a.name === file.name ? { ...a, uploading: false, error: 'Upload failed' } : a
            ));
          });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (name) => setAttachments(prev => prev.filter(a => a.name !== name));

  // ── Account selection logic ────────────────────────────────────────────────
  const toggleAccount = (accId) => setSelectedAccounts(prev => ({ ...prev, [accId]: !prev[accId] }));

  const toggleClient = (client) => {
    const connectedIds = (client.accounts || []).filter(a => a.is_connected).map(a => a.id);
    const allChecked = connectedIds.every(id => selectedAccounts[id]);
    setSelectedAccounts(prev => {
      const next = { ...prev };
      connectedIds.forEach(id => { next[id] = !allChecked; });
      return next;
    });
  };

  const toggleAll = () => {
    const allConnected = clients.flatMap(c => (c.accounts || []).filter(a => a.is_connected));
    const allChecked = allConnected.every(a => selectedAccounts[a.id]);
    setSelectedAccounts(prev => {
      const next = { ...prev };
      allConnected.forEach(a => { next[a.id] = !allChecked; });
      return next;
    });
  };

  const toggleExpand = (id) => setExpandedClients(prev => ({ ...prev, [id]: !prev[id] }));

  const targetAccounts = clients.flatMap(c =>
    (c.accounts || []).filter(a => a.is_connected && selectedAccounts[a.id])
  );
  const allConnected = clients.flatMap(c => (c.accounts || []).filter(a => a.is_connected));
  const allChecked = allConnected.length > 0 && allConnected.every(a => selectedAccounts[a.id]);

  const clientCheckState = (client) => {
    const conn = (client.accounts || []).filter(a => a.is_connected);
    if (conn.length === 0) return 'none';
    const selected = conn.filter(a => selectedAccounts[a.id]);
    if (selected.length === 0) return 'unchecked';
    if (selected.length === conn.length) return 'checked';
    return 'partial';
  };

  // Helper: find client for an account id
  const findClient = (accId) => clients.find(c => (c.accounts || []).some(a => a.id === accId));

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!content.trim() || targetAccounts.length === 0) return;

    // Don't publish while an image is still mid-upload — its public URL
    // isn't ready yet, so it would silently go out without the photo.
    if (attachments.some(a => a.uploading)) {
      setPublishError('Please wait for the image to finish uploading.');
      setPublishState('error');
      return;
    }

    setPublishState('publishing');
    setPublishError('');
    setResults(null);
    try {
      const uploadedImage = attachments.find(a => a.url && !a.error);
      const post = await postsApi.publish({
        content: content.trim(),
        account_ids: targetAccounts.map(a => a.id),
        ...(uploadedImage ? { image_url: uploadedImage.url } : {}),
      });
      setResults(post);
      setPublishState('done');
    } catch (e) {
      setPublishError(e.data?.detail || 'Publish failed. Please try again.');
      setPublishState('error');
    }
  };

  const handleReset = () => {
    setContent('');
    setPublishState('idle');
    setResults(null);
    setPublishError('');
    setAttachments([]);
    // Re-init selection
    const sel = {};
    clients.forEach(c => (c.accounts || []).forEach(a => { sel[a.id] = !!a.is_connected; }));
    setSelectedAccounts(sel);
  };

  const charsLeft = MAX_CHARS - content.length;

  // ── Result screen ──────────────────────────────────────────────────────────
  if (publishState === 'publishing' || publishState === 'done') {
    const distributions = results?.distributions || [];
    const successCount = distributions.filter(d => d.status === 'success').length;
    const failCount = distributions.filter(d => d.status !== 'success').length;

    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-surface-card border border-surface-border rounded-2xl p-8">
          {publishState === 'publishing' && (
            <div className="flex items-center gap-3 mb-6">
              <Loader2 size={20} className="text-brand-400 animate-spin" />
              <div>
                <p className="text-white font-semibold">Publishing post…</p>
                <p className="text-slate-400 text-sm">Distributing to {targetAccounts.length} accounts</p>
              </div>
            </div>
          )}
          {publishState === 'done' && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-1">
                <CheckCheck size={22} className="text-emerald-400" />
                <p className="text-white font-semibold text-lg">Published!</p>
              </div>
              <p className="text-slate-400 text-sm ml-9">
                Sent to <span className="text-white font-medium">{successCount}</span> accounts
                {failCount > 0 && <>, <span className="text-red-400">{failCount} failed</span></>}
              </p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-surface-hover border border-surface-border mb-5 text-sm text-slate-300 whitespace-pre-wrap">
            {content}
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {attachments.map(a => (
                <img key={a.name} src={a.previewUrl || a.url} alt={a.name}
                  className="h-16 w-16 object-cover rounded-lg border border-surface-border" />
              ))}
            </div>
          )}

          {distributions.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {distributions.map(d => (
                <div key={d.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-hover">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={d.account?.platform} />
                    <div>
                      <p className="text-xs font-medium text-white">{d.account?.client?.name}</p>
                      <p className="text-[10px] text-slate-500">{d.account?.handle}</p>
                    </div>
                  </div>
                  {d.status === 'success'
                    ? <CheckCheck size={14} className="text-emerald-400" />
                    : <X size={14} className="text-red-400" />
                  }
                </div>
              ))}
            </div>
          )}

          {publishState === 'done' && (
            <button onClick={handleReset}
              className="mt-6 w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors">
              Create Another Post
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Error screen ───────────────────────────────────────────────────────────
  if (publishState === 'error') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-surface-card border border-surface-border rounded-2xl p-8 text-center">
          <AlertCircle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">Publish failed</p>
          <p className="text-slate-400 text-sm mb-6">{publishError}</p>
          <button onClick={() => setPublishState('idle')}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Compose screen ─────────────────────────────────────────────────────────
  return (
    <div className="p-8" onClick={() => { setShowEmojis(false); }}>
      {/* Link modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowLinkModal(false)}>
          <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-white mb-4">Insert Link</p>
            <input
              type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInsertLink()}
              placeholder="https://example.com" autoFocus
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowLinkModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-surface-border text-sm text-slate-400 hover:text-white transition-all">
                Cancel
              </button>
              <button onClick={handleInsertLink} disabled={!linkUrl.trim()}
                className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold transition-all">
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-white font-display">New Post</h1>
        <p className="text-slate-400 text-sm mt-0.5">Write once, distribute everywhere.</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: content */}
        <div className="col-span-3 space-y-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-3">Post Content</label>
            <textarea
              ref={textareaRef} value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="What do you want to share across your clients' brands?"
              rows={6} maxLength={MAX_CHARS}
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-brand-500/60 transition-colors"
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {attachments.map(a => (
                  <div key={a.name} className="relative group">
                    <img src={a.previewUrl || a.url} alt={a.name}
                      className={`h-16 w-16 object-cover rounded-lg border ${a.error ? 'border-red-500' : 'border-surface-border'} ${a.uploading ? 'opacity-50' : ''}`} />
                    {a.uploading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={16} className="animate-spin text-white" />
                      </div>
                    )}
                    {a.error && (
                      <div className="absolute inset-x-0 -bottom-4 text-[10px] text-red-400 text-center">Failed</div>
                    )}
                    <button onClick={() => removeAttachment(a.name)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileInputRef.current?.click()} title="Attach image"
                  className="p-2 rounded-lg hover:bg-surface-hover text-slate-500 hover:text-slate-300 transition-colors">
                  <Image size={15} />
                </button>
                <button onClick={() => { setShowLinkModal(true); setShowEmojis(false); }} title="Insert link"
                  className="p-2 rounded-lg hover:bg-surface-hover text-slate-500 hover:text-slate-300 transition-colors">
                  <Link2 size={15} />
                </button>
                <div className="relative">
                  <button onClick={() => setShowEmojis(v => !v)} title="Insert emoji"
                    className={`p-2 rounded-lg transition-colors ${showEmojis ? 'bg-surface-hover text-slate-300' : 'text-slate-500 hover:bg-surface-hover hover:text-slate-300'}`}>
                    <Smile size={15} />
                  </button>
                  {showEmojis && (
                    <div className="absolute bottom-10 left-0 z-30 bg-surface-card border border-surface-border rounded-2xl p-3 shadow-2xl w-56">
                      <div className="grid grid-cols-10 gap-1">
                        {EMOJIS.map(e => (
                          <button key={e} onClick={() => handleEmojiClick(e)}
                            className="text-base hover:scale-125 transition-transform leading-none p-0.5 rounded">
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <span className={`text-xs font-mono ${charsLeft < 100 ? 'text-amber-400' : 'text-slate-600'}`}>
                {charsLeft} left
              </span>
            </div>
          </div>

          {targetAccounts.length > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-2xl p-5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-3">
                Will publish to ({targetAccounts.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {targetAccounts.map(acc => {
                  const client = findClient(acc.id);
                  return (
                    <div key={acc.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-hover border border-surface-border text-[11px] text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ background: client?.color || '#6366f1' }} />
                      <PlatformIcon platform={acc.platform} />
                      <span>{acc.handle || client?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: account selector */}
        <div className="col-span-2">
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5 sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Select Accounts</label>
              {!clientsLoading && allConnected.length > 0 && (
                <button onClick={toggleAll} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {clientsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-surface-hover animate-pulse" />
                ))}
              </div>
            ) : clientsError ? (
              <div className="text-center py-6">
                <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500 mb-2">{clientsError}</p>
                <button onClick={fetchClients} className="text-xs text-brand-400 hover:text-brand-300">Retry</button>
              </div>
            ) : clients.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No clients yet. Add one in the Clients page.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {clients.map(client => {
                  const checkState = clientCheckState(client);
                  const isExpanded = expandedClients[client.id];
                  const connectedAccs = (client.accounts || []).filter(a => a.is_connected);
                  const selectedCount = connectedAccs.filter(a => selectedAccounts[a.id]).length;

                  return (
                    <div key={client.id}
                      className={`rounded-xl border transition-all ${checkState !== 'unchecked'
                        ? 'border-brand-600/40 bg-brand-600/5'
                        : 'border-surface-border bg-surface-hover'}`}>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => toggleClient(client)}
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${checkState === 'checked' ? 'bg-brand-600 border-brand-600' :
                              checkState === 'partial' ? 'bg-brand-600/40 border-brand-600' :
                                'border-slate-600 hover:border-slate-400'}`}>
                            {checkState === 'checked' && <CheckCheck size={9} className="text-white" />}
                            {checkState === 'partial' && <Minus size={9} className="text-white" />}
                          </button>
                          <div className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold"
                            style={{ background: (client.color || '#6366f1') + '22', color: client.color || '#6366f1' }}>
                            {client.logo_initials || client.name?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-white">{client.name}</p>
                            <p className="text-[10px] text-slate-500">{selectedCount}/{connectedAccs.length} selected</p>
                          </div>
                        </div>
                        <button onClick={() => toggleExpand(client.id)}
                          className="text-slate-600 hover:text-slate-400 transition-colors">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-surface-border px-3 pb-2.5 pt-2 space-y-1">
                          {(client.accounts || []).map(acc => {
                            const isConnected = acc.is_connected;
                            const isChecked = isConnected && selectedAccounts[acc.id];
                            return (
                              <button key={acc.id}
                                onClick={() => isConnected && toggleAccount(acc.id)}
                                disabled={!isConnected}
                                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all text-left ${!isConnected ? 'opacity-30 cursor-not-allowed' :
                                  isChecked ? 'bg-brand-600/10 hover:bg-brand-600/15' : 'hover:bg-surface-card'}`}>
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${isChecked ? 'bg-brand-600 border-brand-600' : 'border-slate-600'}`}>
                                  {isChecked && <CheckCheck size={8} className="text-white" />}
                                </div>
                                <PlatformIcon platform={acc.platform} />
                                <span className={`text-[11px] flex-1 ${isChecked ? 'text-slate-200' : 'text-slate-500'}`}>
                                  {acc.handle || `${client.name} ${acc.platform}`}
                                </span>
                                {!isConnected && (
                                  <span className="text-[9px] text-slate-700 flex items-center gap-0.5">
                                    <AlertCircle size={9} /> not connected
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-surface-border">
              <p className="text-xs text-slate-500 mb-3">
                <span className="text-white font-medium">{targetAccounts.length}</span> accounts selected
              </p>
              <button onClick={handlePublish}
                disabled={!content.trim() || targetAccounts.length === 0 || clientsLoading}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl transition-all">
                <Send size={15} />
                Publish to {targetAccounts.length} account{targetAccounts.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}