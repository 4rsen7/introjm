import { API_BASE_URL } from '../config/api';

export const api = {
  getJourneys: () => fetch(`${API_BASE_URL}/journeys`),
  createJourney: (data) => fetch(`${API_BASE_URL}/journeys`, { method: 'POST', body: data }),
  // ... і так далі
};
