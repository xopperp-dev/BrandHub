// ConnectModal.jsx — drop-in replacement for the ConnectModal in Clients.jsx
// Facebook, Instagram, Reddit, YouTube, Pinterest, Tumblr, X, LinkedIn: OAuth popup (no manual token copy-paste)

import { useState, useEffect, useRef } from 'react';
import { accounts as accountsApi } from '../api/client';
import PlatformIcon from '../components/PlatformIcon';
import {
    X, CheckCircle2, Loader2, AlertCircle, ExternalLink,
    Eye, EyeOff, ChevronRight
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
};

// ── Facebook / Instagram OAuth Modal ─────────────────────────────────────────

function FacebookOAuthModal({ client, account, onClose, onSaved }) {
    const [step, setStep] = useState('idle'); // idle | opening | waiting | pick_page | saving | success | error
    const [pages, setPages] = useState([]);
    const [stateKey, setStateKey] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const [igSaved, setIgSaved] = useState(null);
    const pollRef = useRef(null);
    const popupRef = useRef(null);

    const platformName = platformLabels[account.platform];
    const platformColor = platformColors['facebook']; // always use FB color for OAuth

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    // Listen for postMessage from popup
    useEffect(() => {
        const handler = (e) => {
            if (e.data?.type !== 'FB_OAUTH_DONE') return;
            if (!e.data.success) {
                stopPolling();
                setErrMsg(e.data.error || 'Facebook login failed.');
                setStep('error');
                return;
            }
            // Popup closed successfully — poll for result
            setStep('waiting');
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    // Poll status after popup closes
    useEffect(() => {
        if (step !== 'waiting' || !stateKey) return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/oauth/facebook/status/${stateKey}/`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
                );
                const data = await res.json();
                if (data.pending) return;
                stopPolling();
                if (data.success) {
                    if (data.auto_saved && data.account) {
                        // Single Page — already connected server-side, same
                        // one-click UX as X/YouTube. Skip the picker entirely.
                        if (data.ig_connected) setIgSaved(data.ig_connected);
                        setStep('success');
                        setTimeout(() => {
                            onSaved(data.account);
                            if (data.ig_connected) onSaved(data.ig_connected);
                            onClose();
                        }, 1500);
                    } else {
                        // Multiple Pages — can't auto-decide, show picker.
                        setPages(data.pages || []);
                        setStep('pick_page');
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
                `/api/oauth/facebook/start/?client_id=${client.id}&account_id=${account.id}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to start OAuth.');

            setStateKey(data.state);

            // Open popup
            const w = 600, h = 700;
            const left = window.screenX + (window.outerWidth - w) / 2;
            const top = window.screenY + (window.outerHeight - h) / 2;
            popupRef.current = window.open(
                data.oauth_url,
                'fb_oauth',
                `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
            );

            setStep('waiting');

            // Fallback: detect popup closed manually
            const checker = setInterval(() => {
                if (popupRef.current?.closed) {
                    clearInterval(checker);
                    // step stays 'waiting' — postMessage may have already fired
                }
            }, 500);

        } catch (e) {
            setErrMsg(e.message || 'Could not start Facebook login.');
            setStep('error');
        }
    };

    const handlePageSelect = async (page) => {
        setStep('saving');
        try {
            const res = await fetch('/api/oauth/facebook/save/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('bh_access')}`,
                },
                body: JSON.stringify({
                    state: stateKey,
                    page_id: page.id,
                    page_name: page.name,
                    page_access_token: page.access_token,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to save.');

            if (data.ig_connected) setIgSaved(data.ig_connected);
            setStep('success');
            setTimeout(() => {
                onSaved(data.account);
                if (data.ig_connected) onSaved(data.ig_connected);
                onClose();
            }, 1500);
        } catch (e) {
            setErrMsg(e.message);
            setStep('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: platformColor + '22' }}>
                            <PlatformIcon platform="facebook" />
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

                    {/* Idle — show connect button */}
                    {step === 'idle' && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-400 leading-relaxed">
                                Click below to log in with Facebook. If you manage more than one Page, you'll be asked which one to connect — otherwise it connects automatically.
                                {account.platform === 'instagram' && (
                                    <span className="block mt-1 text-[11px] text-slate-500">
                                        Instagram will also be connected automatically if your IG account is linked to a Facebook Page.
                                    </span>
                                )}
                            </p>
                            <button
                                onClick={handleStart}
                                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2"
                                style={{ background: '#1877F2' }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                                Continue with Facebook
                            </button>
                        </div>
                    )}

                    {/* Opening popup */}
                    {step === 'opening' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Opening Facebook login…</p>
                        </div>
                    )}

                    {/* Waiting for popup */}
                    {step === 'waiting' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Waiting for Facebook login…</p>
                            <p className="text-xs text-slate-500">Complete the login in the popup window</p>
                            <button onClick={() => { stopPolling(); setStep('idle'); }}
                                className="text-xs text-slate-600 hover:text-slate-400 mt-1">Cancel</button>
                        </div>
                    )}

                    {/* Pick page */}
                    {step === 'pick_page' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-400 font-medium">Select a Facebook Page to connect:</p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {pages.map(page => (
                                    <button
                                        key={page.id}
                                        onClick={() => handlePageSelect(page)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-surface-border hover:border-brand-500/50 hover:bg-brand-600/5 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            {page.picture?.data?.url ? (
                                                <img src={page.picture.data.url} alt="" className="w-8 h-8 rounded-full" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                                                    <PlatformIcon platform="facebook" />
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-sm text-white font-medium">{page.name}</p>
                                                <p className="text-[10px] text-slate-500">ID: {page.id}</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-500" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Saving */}
                    {step === 'saving' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Saving…</p>
                        </div>
                    )}

                    {/* Success */}
                    {step === 'success' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <CheckCircle2 size={26} className="text-emerald-400" />
                            <p className="text-sm text-white font-medium">Connected!</p>
                            {igSaved && (
                                <p className="text-xs text-emerald-400">Instagram also connected automatically ✅</p>
                            )}
                        </div>
                    )}

                    {/* Error */}
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

// ── LinkedIn OAuth Modal (org picker, mirrors Facebook's page picker) ────────

function LinkedInOAuthModal({ client, account, onClose, onSaved }) {
    const [step, setStep] = useState('idle'); // idle | opening | waiting | pick_org | saving | success | error
    const [orgs, setOrgs] = useState([]);
    const [stateKey, setStateKey] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const pollRef = useRef(null);
    const popupRef = useRef(null);

    const platformName = platformLabels['linkedin'];
    const platformColor = platformColors['linkedin'];

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    useEffect(() => {
        const handler = (e) => {
            if (e.data?.type !== 'LINKEDIN_OAUTH_DONE') return;
            if (!e.data.success) {
                stopPolling();
                setErrMsg(e.data.error || 'LinkedIn login failed.');
                setStep('error');
                return;
            }
            setStep('waiting');
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    useEffect(() => {
        if (step !== 'waiting' || !stateKey) return;
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/oauth/linkedin/status/${stateKey}/`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
                );
                const data = await res.json();
                if (data.pending) return;
                stopPolling();
                if (data.success) {
                    setOrgs(data.orgs || []);
                    setStep('pick_org');
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
                `/api/oauth/linkedin/start/?client_id=${client.id}&account_id=${account.id}`,
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
                'linkedin_oauth',
                `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
            );

            setStep('waiting');
        } catch (e) {
            setErrMsg(e.message || 'Could not start LinkedIn login.');
            setStep('error');
        }
    };

    const handleOrgSelect = async (org) => {
        setStep('saving');
        try {
            const res = await fetch('/api/oauth/linkedin/save/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('bh_access')}`,
                },
                body: JSON.stringify({
                    state: stateKey,
                    org_id: org.id,
                    org_name: org.name,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to save.');
            setStep('success');
            setTimeout(() => { onSaved(data.account); onClose(); }, 1500);
        } catch (e) {
            setErrMsg(e.message);
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
                            <PlatformIcon platform="linkedin" />
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
                            <p className="text-sm text-slate-400 leading-relaxed">
                                Click below to log in with LinkedIn. You'll be asked to choose which Company Page to connect.
                                <span className="block mt-1 text-[11px] text-slate-500">
                                    Requires the connecting account to be an admin of the LinkedIn Company Page, and the app must have Marketing Developer Platform access approved.
                                </span>
                            </p>
                            <button
                                onClick={handleStart}
                                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2"
                                style={{ background: '#0A66C2' }}
                            >
                                Continue with LinkedIn
                            </button>
                        </div>
                    )}

                    {step === 'opening' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Opening LinkedIn login…</p>
                        </div>
                    )}

                    {step === 'waiting' && (
                        <div className="py-8 flex flex-col items-center gap-3">
                            <Loader2 size={22} className="text-brand-400 animate-spin" />
                            <p className="text-sm text-white">Waiting for LinkedIn login…</p>
                            <p className="text-xs text-slate-500">Complete the login in the popup window</p>
                            <button onClick={() => { stopPolling(); setStep('idle'); }}
                                className="text-xs text-slate-600 hover:text-slate-400 mt-1">Cancel</button>
                        </div>
                    )}

                    {step === 'pick_org' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-400 font-medium">Select a Company Page to connect:</p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {orgs.map(org => (
                                    <button
                                        key={org.id}
                                        onClick={() => handleOrgSelect(org)}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-surface-border hover:border-brand-500/50 hover:bg-brand-600/5 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                                                <PlatformIcon platform="linkedin" />
                                            </div>
                                            <div>
                                                <p className="text-sm text-white font-medium">{org.name}</p>
                                                <p className="text-[10px] text-slate-500">ID: {org.id}</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="text-slate-500" />
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

// ── Generic single-step OAuth modal (Reddit / YouTube / Pinterest / Tumblr / X) ──
// Unlike Facebook, these platforms have no "pick a page" step — the backend's
// <platform>_oauth_save endpoint only needs { state } and resolves the account
// directly from the cached OAuth result.

const OAUTH_CONFIG = {
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
};

function SimpleOAuthModal({ client, account, onClose, onSaved }) {
    const [step, setStep] = useState('idle'); // idle | opening | waiting | saving | success | error
    const [stateKey, setStateKey] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const pollRef = useRef(null);
    const popupRef = useRef(null);

    const cfg = OAUTH_CONFIG[account.platform];
    const platformName = platformLabels[account.platform];
    const platformColor = platformColors[account.platform];

    const stopPolling = () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    const saveAccount = async (finishedState) => {
        setStep('saving');
        try {
            const res = await fetch(`/api/oauth/${cfg.base}/save/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('bh_access')}`,
                },
                body: JSON.stringify({ state: finishedState }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Failed to save.');
            setStep('success');
            setTimeout(() => { onSaved(data.account); onClose(); }, 1200);
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
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/oauth/${cfg.base}/status/${stateKey}/`,
                    { headers: { Authorization: `Bearer ${localStorage.getItem('bh_access')}` } }
                );
                const data = await res.json();
                if (data.pending) return;
                stopPolling();
                if (data.success) {
                    saveAccount(stateKey);
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

// ── Manual token modal (LinkedIn only — X now uses OAuth popup above) ────────

const MANUAL_HELP = {
    linkedin: {
        idLabel: 'Organization ID',
        idPlaceholder: 'e.g. 90123456',
        tokenLabel: 'Access Token',
        profilePlaceholder: 'https://linkedin.com/company/yourco',
        help: 'From a LinkedIn app with Marketing Developer Platform enabled. Requires LinkedIn approval.',
    },
};

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

export default function ConnectModal({ client, account, onClose, onSaved }) {
    if (account.platform === 'facebook' || account.platform === 'instagram') {
        return <FacebookOAuthModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
    }
    if (account.platform === 'linkedin') {
        return <LinkedInOAuthModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
    }
    if (account.platform === 'reddit' || account.platform === 'youtube' || account.platform === 'pinterest' || account.platform === 'tumblr' || account.platform === 'x') {
        return <SimpleOAuthModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
    }
    return <ManualTokenModal client={client} account={account} onClose={onClose} onSaved={onSaved} />;
}