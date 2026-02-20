import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: typeof window !== 'undefined' ? (localStorage.getItem('app_locale') || 'en') : 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export function setLocale(lng, reload = false) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app_locale', lng);
  }
  if (!reload) {
    i18n.changeLanguage(lng);
  }
  if (reload && typeof window !== 'undefined') {
    window.location.reload();
  }
}

export default i18n;
