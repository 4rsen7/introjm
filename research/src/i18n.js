import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';
import legacyEn from '../../client/src/locales/en.json';
import legacyUk from '../../client/src/locales/uk.json';

const i18n = createInstance();
let language = 'uk';
try { language = localStorage.getItem('research.locale') || 'uk'; } catch { /* Storage may be unavailable. */ }
if (!['uk', 'en'].includes(language)) language = 'uk';
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { research: en, interviews: legacyEn.interviews } },
    uk: { translation: { research: uk, interviews: legacyUk.interviews } },
  },
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try { localStorage.setItem('research.locale', lng); } catch { /* Optional preference. */ }
});
document.documentElement.lang = language;
export default i18n;
