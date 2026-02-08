export const api = {
  getJourneys: () => fetch('/api/journeys'),
  createJourney: (data) => fetch('/api/journeys', { method: 'POST', body: data }),
  // ... і так далі
};