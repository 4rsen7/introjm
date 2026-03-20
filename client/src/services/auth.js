import { supabase } from '../supabaseClient';

const REACT_QUERY_PERSIST_KEYS = ['REACT_QUERY_OFFLINE_CACHE'];
const SUPABASE_AUTH_STORAGE_SUFFIX = '-auth-token';

const getSupabaseStorageKeys = () => {
    try {
        return Object.keys(localStorage).filter(
            (key) => key.startsWith('sb-') && key.endsWith(SUPABASE_AUTH_STORAGE_SUFFIX)
        );
    } catch {
        return [];
    }
};

const getStoredSupabaseSession = () => {
    for (const key of getSupabaseStorageKeys()) {
        try {
            const rawValue = localStorage.getItem(key);
            if (!rawValue) continue;

            const parsedValue = JSON.parse(rawValue);
            const accessToken = parsedValue?.access_token ?? parsedValue?.currentSession?.access_token ?? null;
            if (accessToken) {
                return parsedValue;
            }
        } catch {
            // Ignore malformed local storage values and keep looking for a valid Supabase session.
        }
    }

    return null;
};

export const persistStoredAuthState = (session) => {
    try {
        if (!session?.access_token || !session?.user) return null;
        return session;
    } catch (error) {
        console.error('Error persisting auth state:', error);
        return null;
    }
};

export const getStoredAuthToken = () => {
    try {
        const session = getStoredSupabaseSession();
        return session?.access_token ?? session?.currentSession?.access_token ?? null;
    } catch {
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
        REACT_QUERY_PERSIST_KEYS.forEach((key) => localStorage.removeItem(key));

        getSupabaseStorageKeys().forEach((key) => {
            localStorage.removeItem(key);
        });
    } catch (error) {
        console.error('Error clearing auth state:', error);
    }
};
