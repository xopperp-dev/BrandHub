import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // true while we check stored token

    // On mount — if there's a stored access token, fetch the current user
    useEffect(() => {
        const token = localStorage.getItem('bh_access');
        if (!token) {
            setLoading(false);
            return;
        }
        auth.me()
            .then(setUser)
            .catch(() => {
                // Token invalid / expired and refresh failed — clear it
                localStorage.removeItem('bh_access');
                localStorage.removeItem('bh_refresh');
            })
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (email, password) => {
        const data = await auth.login({ email, password });
        setUser(data.user);
        return data;
    }, []);

    const register = useCallback(async (payload) => {
        const data = await auth.register(payload);
        setUser(data.user || data);
        return data;
    }, []);

    const logout = useCallback(async () => {
        try { await auth.logout(); } catch (_) { }
        setUser(null);
    }, []);

    const updateUser = useCallback((updated) => {
        setUser(prev => ({ ...prev, ...updated }));
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}