// ConnectModal.jsx — drop-in replacement for the ConnectModal in Clients.jsx
// Facebook, Instagram, Reddit, YouTube, Pinterest, Tumblr, X, TikTok, LinkedIn:
// OAuth popup (no manual token copy-paste). LinkedIn has one extra step —
// after login, the user picks which Company Page to connect from a list.

import { useState, useEffect, useRef } from 'react';
import { accounts as accountsApi } from '../api/client';
import PlatformIcon from '../components/PlatformIcon';
import {
    X, CheckCircle2, Loader2, AlertCircle, ExternalLink,
    Eye, EyeOff
} from 'lucide-react';

const platformLabels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    x: 'X (Twitter)',
    youtube: 'YouTube',
    reddit: 'Reddit',
    pinterest: 'Pinterest',
    tumblr: 'Tumblr',
    tiktok: 'TikTok',
};

const platformColors = {
    facebook: '#1877F2',
    instagram: '#E1306C',
    linkedin: '#0A66C2',
    x: '#ffffff',
    youtube: '#FF0000',
    reddit: '#FF4500',
    pinterest: '#E60023',
    tumblr: '#36465D',
    tiktok: '#EE1D52',
};

// ── Generic single-step OAuth modal (Facebook / Instagram / Reddit / YouTube / Pinterest / Tumblr / X / TikTok) ──
// One-click connect — the backend's <platform>_oauth_save endpoint only
// needs { state } and resolves the account (and, for Facebook, the
// auto-selected Page + any linked Instagram account) directly from the
// cached OAuth result. No page-picker is shown.

const OAUTH_CONFIG = {
    facebook: {
        base: 'facebook',
        messageType: 'FB_OAUTH_DONE',
        brandColor: '#1877F2',
        cta: 'Continue with Facebook',
        description: "Click below to log in with Facebook and authorize BrandHub to post on this account's behalf. The first Page you manage is connected automatically.",
    },
    instagram: {
        base: 'facebook',
        messageType: 'FB_OAUTH_DONE',
        brandColor: '#E1306C',
        cta: 'Continue with Facebook',
        description: "Instagram connects through Facebook login. Click below to log in — if your IG account is linked to a Facebook Page, it's connected automatically.",
    },
    reddit: {
        base: 'reddit',
        messageType: 'REDDIT_OAUTH_DONE',
        brandColor: '#FF4500',
        cta: 'Continue with Reddit',
        description: "Click below to log in with Reddit and authorize BrandHub to post on this account's behalf.",
    },
    youtube: {
        base: 'youtube',
        messageType: 'YT_OAUTH_DONE',
        brandColor: '#FF0000',
        cta: 'Continue with Google',
        description: 'Click below to sign in with the Google account that owns the YouTube channel you want to connect.',
    },
    pinterest: {
        base: 'pinterest',
        messageType: 'PINTEREST_OAUTH_DONE',
        brandColor: '#E60023',
        cta: 'Continue with Pinterest',
        description: "Click below to log in with Pinterest and authorize BrandHub to create pins on this account's behalf.",
    },
    tumblr: {
        base: 'tumblr',
        messageType: 'TUMBLR_OAUTH_DONE',
        brandColor: '#36465D',
        cta: 'Continue with Tumblr',
        description: "Click below to log in with Tumblr and authorize BrandHub to post to this account's primary blog.",
    },
    x: {
        base: 'x',
        messageType: 'X_OAUTH_DONE',
        brandColor: '#000000',
        cta: 'Continue with X',
        description: "Click below to log in with X and authorize BrandHub to post on this account's behalf.",
    },
    tiktok: {
        base: 'tiktok',
        messageType: 'TIKTOK_OAUTH_DONE',
        brandColor: '#EE1D52',
        cta: 'Continue with TikTok',
        description: "Click below to log in with TikTok and authorize BrandHub to access this account.",
    },
    linkedin: {
        base: 'linkedin',
        messageType: 'LINKEDIN_OAUTH_DONE',
        brandColor: '#0A66C2',
        cta: 'Continue with LinkedIn',
        description: "Click below to log in with LinkedIn and authorize BrandHub. You'll then pick which Company Page to connect.",
    },
};

function SimpleOAuthModal({ client, account, onClose, onSaved }) {
    const [step, setStep] = useState('idle'); // idle | opening | waiting | picking | saving | success | error
    const [stateKey, setStateKey] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const [igConnected, setIgConnected] = useState(null);
    const [orgs, setOrgs] = useState([]); // LinkedIn only: orgs to pick from
    const pollRef = useRef(null);
    const popupRef = useRef(null);

    const cfg = OAUTH_CONFIG[account.platform];
    const isLinkedIn = account.platform === 'linkedin';
    const platformName = platformLabels[account.platform];
    const platformColor = platformColors[account.platform];

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const saveAccount = async (finishedState, org) => {
        setStep('saving');
        try {
            const body = isLinkedIn
                ? { state: finishedState, org_id: org.id, org_name: org.name }
                : { state: finishedState };
            const res = await fetch(`/api/oauth/${cfg.base}/save/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('bh_access')}`,
                },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to save.');
            if (data.ig_connected) setIgConnected(data.ig_connected);
            setStep('success');
            setTimeout(() => {
                onSaved(data.account);
                if (data.ig_connected) onSaved(data.ig_connected);
                onClose();
            }, 1200);
        } catch (e) {
            setErrMsg(e.message || 'Could not save connection.');
            setStep('error');
        }
    };

    // Listen for postMessage from popup
    useEffect(() => {
        const handler = (e) => {
            if (e.data?.type !== cfg.messageType) return;
            if (!e.data.success) {
                stopPolling();
                setErrMsg(e.data.error || `${platformName} login failed.`);
                setStep('error');
                return;
            }
            setStep('waiting');
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [cfg.messageType, platformName]);

    // Poll status after popup closes
    useEffect(() => {
        if (step !== 'waiting' || !stateKey) return;
        const startedAt = Date.now();
        const POLL_TIMEOUT_MS = 90_000; // stop after 90s of no resolution

        pollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                stopPolling();
                setErrMsg(
                    `Taking longer than expected. This can happen if the login popup was closed, ` +
                    `blocked, or if ${platformName} isn't reachable from your current network/region. ` +
                    `Check your connection and try again.`
                );
                setStep('error');
                return;
            }
            try {
                const res = await fetch(
                    `/api/oauth/${cfg.base}/status/${stateKey}/`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
                );
                const data = await res.json();
                if (data.pending) return;
                stopPolling();
                if (data.success) {
                    if (isLinkedIn) {
                        if (!data.orgs || data.orgs.length === 0) {
                            setErrMsg('No LinkedIn Company Pages found for this account.');
                            setStep('error');
                            return;
                        }
                        setOrgs(data.orgs);
                        setStep('picking');
                    } else {
                        saveAccount(stateKey);
                    }
                } else {
                    setErrMsg(data.error || 'Something went wrong.');
                    setStep('error');
                }
            } catch {
                stopPolling();
                setErrMsg('Could not check OAuth status.');
                setStep('error');
            }
        }, 1500);
        return stopPolling;
    }, [step, stateKey]);

    const handleStart = async () => {
        setStep('opening');
        setErrMsg('');
        try {
            const res = await fetch(
                `/api/oauth/${cfg.base}/start/?client_id=${client.id}&account_id=${account.id}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to start OAuth.');

            setStateKey(data.state);

            const w = 600, h = 700;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            popupRef.current = window.open(
                data.oauth_url,
                `${cfg.base}_oauth`,
                `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
            );

            setStep('waiting');
        } catch (e) {
            setErrMsg(e.message || `Could not start ${platformName} login.`);
            setStep('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl">

                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: platformColor + '22' }}>
                            <PlatformIcon platform={account.platform} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Connect {platformName}</p>
                            <p className="text-xs text-slate-500">{client.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-surface-hover transition-all">
                        <X size={15} />
                    </button>
                </div>

                <div className="p-5">
                    {step === 'idle' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-400 leading-relaxed">{cfg.description}</p>
                            <button
                                onClick={handleStart}
                                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2"
                                style={{ background: cfg.brandColor }}
                            >
                                {cfg.cta}
                            </button>
                        </div>
                    )}

                    {step === 'opening' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Opening {platformName} login…</p>
                        </div>
                    )}

                    {step === 'waiting' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Waiting for {platformName} login…</p>
                            <p className="text-xs text-slate-500">Complete the login in the popup window</p>
                            <button onClick={() => { stopPolling(); setStep('idle'); }}
                                className="text-xs text-slate-600 hover:text-slate-400 mt-1">Cancel</button>
                        </div>
                    )}

                    {step === 'picking' && (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-400">Choose which Company Page to connect:</p>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {orgs.map((org) => (
                                    <button
                                        key={org.id}
                                        onClick={() => saveAccount(stateKey, org)}
                                        className="w-full text-left px-3.5 py-2.5 rounded-xl bg-surface-hover border border-surface-border hover:border-brand-500/60 text-sm text-slate-200 transition-all"
                                    >
                                        {org.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'saving' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Saving…</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <CheckCircle2 size={26} className="text-emerald-400" />
                            <p className="text-sm text-white font-medium">Connected!</p>
                            {igConnected && (
                                <p className="text-xs text-emerald-400">Instagram also connected automatically ✅</p>
                            )}
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="space-y-3">
                            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                                {errMsg}
                            </div>
                            <button onClick={() => setStep('idle')}
                                className="w-full py-2.5 rounded-xl bg-surface-hover border border-surface-border text-sm text-slate-300 hover:text-white transition-all">
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Manual token modal (fallback for any platform not in OAUTH_CONFIG) ───────

const MANUAL_HELP = {};

function ManualTokenModal({ client, account, onClose, onSaved }) {
    const cfg = MANUAL_HELP[account.platform];
    const [pageId, setPageId] = useState(account.page_id || '');
    const [token, setToken] = useState('');
    const [profileUrl, setProfileUrl] = useState(account.profile_url || '');
    const [showToken, setShowToken] = useState(false);
    const [status, setStatus] = useState('idle');
    const [errMsg, setErrMsg] = useState('');

    const platformName = platformLabels[account.platform];
    const platformColor = platformColors[account.platform];

    const handleSave = async () => {
        if (!pageId.trim() || !token.trim()) return;
        setStatus('saving'); setErrMsg('');
        try {
            const updated = await accountsApi.update(client.id, account.id, {
                profile_url: profileUrl.trim(),
                page_id: pageId.trim(),
                access_token: token.trim(),
                is_connected: true,
            });
            setStatus('success');
            setTimeout(() => { onSaved(updated); onClose(); }, 900);
        } catch (e) {
            setErrMsg(e.data?.detail || 'Could not save. Check and try again.');
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: (platformColor || '#6366f1') + '22' }}>
                            <PlatformIcon platform={account.platform} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-white">Connect {platformName}</p>
                            <p className="text-xs text-slate-500">{client.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-surface-hover transition-all">
                        <X size={15} />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {status === 'saving' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Saving…</p>
                        </div>
                    )}
                    {status === 'success' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <CheckCircle2 size={26} className="text-emerald-400" />
                            <p className="text-sm text-white font-medium">Saved!</p>
                        </div>
                    )}
                    {(status === 'idle' || status === 'error') && (
                        <>
                            {status === 'error' && (
                                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                                    <AlertCircle size={13} className="shrink-0" /> {errMsg}
                                </div>
                            )}
                            <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">Profile URL <span className="text-slate-600">(optional)</span></label>
                                <div className="relative">
                                    <ExternalLink size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                                    <input type="url" value={profileUrl} onChange={e => setProfileUrl(e.target.value)}
                                        placeholder={cfg.profilePlaceholder}
                                        className="w-full bg-surface-hover border border-surface-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">{cfg.idLabel}</label>
                                <input type="text" value={pageId} onChange={e => setPageId(e.target.value)}
                                    placeholder={cfg.idPlaceholder}
                                    className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-400 block mb-1.5">{cfg.tokenLabel}</label>
                                <div className="relative">
                                    <input type={showToken ? 'text' : 'password'} value={token}
                                        onChange={e => setToken(e.target.value)} placeholder="Paste token here"
                                        className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors" />
                                    <button onClick={() => setShowToken(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                                        {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-1.5">Stored encrypted · never shown again</p>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed bg-surface-hover/60 border border-surface-border rounded-xl px-3 py-2.5">
                                {cfg.help}
                            </p>
                            <button onClick={handleSave} disabled={!pageId.trim() || !token.trim()}
                                className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all">
                                Connect
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main ConnectModal router ──────────────────────────────────────────────────

const OAUTH_PLATFORMS = new Set(Object.keys(OAUTH_CONFIG));

export default function ConnectModal({ client, account, onClose, onSaved }) {
    if (OAUTH_PLATFORMS.has(account.platform)) {
        return <SimpleOAuthModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
    }
    return <ManualTokenModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
}