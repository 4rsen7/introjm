import { supabase } from '../supabaseClient';

const REACT_QUERY_PERSIST_KEYS = ['REACT_QUERY_OFFLINE_CACHE'];

export const getStoredAuthToken = () => {
    try {
        return localStorage.getItem('token') || null;
    } catch (error) {
        return null;
    }
};

export const getAuthToken = async () => {
    try {
        const storedToken = getStoredAuthToken();
        if (storedToken) return storedToken;

        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || null;
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
