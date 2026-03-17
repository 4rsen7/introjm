const DEFAULT_API_BASE_URL = import.meta.env.DEV ? '/api' : 'https://iterojm.com/api';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
