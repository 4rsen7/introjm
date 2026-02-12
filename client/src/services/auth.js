import { supabase } from '../supabaseClient';

export const getAuthToken = async () => {
    try {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token || null;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
};