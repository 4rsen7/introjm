import { supabase } from '../supabaseClient';

const REACT_QUERY_PERSIST_KEYS = ['REACT_QUERY_OFFLINE_CACHE'];

export const persistStoredAuthState = (session) => {
    try {
        if (!session?.access_token || !session?.user) return null;
        localStorage.setItem('token', session.access_token);
        localStorage.setItem('user', JSON.stringify(session.user));
        return session;
    } catch (error) {
        console.error('Error persisting auth state:', error);
        return null;
    }
};

export const getStoredAuthToken = () => {
    try {
        return localStorage.getItem('token') || null;
    } catch (error) {
        return null;
    }
};

export const getActiveSession = async () => {
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data.session ?? null;
        if (session?.access_token) {
            persistStoredAuthState(session);
            return session;
        }

        clearStoredAuthState();
        return null;
    } catch (error) {
        console.error('Error getting active session:', error);
        clearStoredAuthState();
        return null;
    }
};

export const getAuthToken = async () => {
    try {
        const session = await getActiveSession();
        return session?.access_token || null;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
};

export const clearStoredAuthState = () => {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        REACT_QUERY_PERSIST_KEYS.forEach((key) => localStorage.removeItem(key));

        Object.keys(localStorage).forEach((key) => {
            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
};
