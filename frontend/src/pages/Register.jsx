import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        organization_name: '',
    });
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { first_name, email, password, organization_name } = form;
        if (!first_name || !email || !password || !organization_name) {
            setError('Please fill in all required fields.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setLoading(true);
        try {
            await register(form);
            navigate('/', { replace: true });
        } catch (err) {
            // Django returns field-level errors as { email: [...], password: [...] }
            const data = err?.data;
            if (data) {
                const first = Object.values(data)[0];
                setError(Array.isArray(first) ? first[0] : (data.detail || 'Registration failed.'));
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen dot-grid flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm">

                {/* Logo */}
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
                        <Zap size={18} className="text-white" />
                    </div>
                    <span className="text-xl font-bold text-white font-display">BrandHub</span>
                </div>

                {/* Card */}
                <div className="bg-surface-card border border-surface-border rounded-2xl p-8">
                    <h1 className="text-lg font-bold text-white font-display mb-1">Create your account</h1>
                    <p className="text-sm text-slate-400 mb-6">Set up your organization workspace</p>

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Organization */}
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Organization name <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.organization_name}
                                onChange={set('organization_name')}
                                placeholder="e.g. Delemon Tech"
                                autoFocus
                                className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
                            />
                        </div>

                        {/* Name row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                    First name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.first_name}
                                    onChange={set('first_name')}
                                    placeholder="John"
                                    className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                    Last name
                                </label>
                                <input
                                    type="text"
                                    value={form.last_name}
                                    onChange={set('last_name')}
                                    placeholder="Optional"
                                    className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Email address <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={set('email')}
                                placeholder="you@company.com"
                                autoComplete="email"
                                className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                Password <span className="text-red-400">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    value={form.password}
                                    onChange={set('password')}
                                    placeholder="Min. 8 characters"
                                    autoComplete="new-password"
                                    className="w-full bg-surface-hover border border-surface-border rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
                                >
                                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-all mt-2"
                        >
                            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                            {loading ? 'Creating account…' : 'Create account'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-slate-500 mt-5">
                    Already have an account?{' '}
                    <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}