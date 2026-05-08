import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { setLocale } from '../../i18n';

const BROWSER_HOSTNAME = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
const IS_LOCAL_BROWSER = BROWSER_HOSTNAME === 'localhost' || BROWSER_HOSTNAME === '127.0.0.1';
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const APP_AUTH_HREF = IS_LOCAL_BROWSER ? '/auth' : `${APP_ORIGIN}/auth`;

const LANG_OPTIONS = [
  { code: 'uk', label: 'UA' },
  { code: 'en', label: 'EN' },
];

const AI_INSIGHTS_LABEL = {
  en: 'AI Insights',
  uk: 'AI інсайти',
};

const getLandingPath = (lang = 'en') => `/${lang === 'uk' ? 'uk' : 'en'}`;
const cn = (...parts) => parts.filter(Boolean).join(' ');

function getAlternateLanguagePath(pathname, nextLang) {
  const normalizedLang = nextLang === 'uk' ? 'uk' : 'en';
  const match = pathname.match(/^\/(en|uk)(\/.*)?$/);
  if (!match) return getLandingPath(normalizedLang);
  return `/${normalizedLang}${match[2] || ''}`;
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function MarketingHeader({ lang = 'en' }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef(null);
  const currentLang = lang === 'uk' ? 'uk' : 'en';
  const currentLangLabel = LANG_OPTIONS.find((opt) => opt.code === currentLang)?.label ?? 'EN';
  const isLandingPage = location.pathname === getLandingPath(currentLang);

  useEffect(() => {
    if (i18n.language !== currentLang) {
      setLocale(currentLang);
    }
  }, [currentLang, i18n.language]);

  useEffect(() => {
    if (!langDropdownOpen) return undefined;

    const handleClickOutside = (event) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
        setLangDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [langDropdownOpen]);

  const handleSectionNav = (event, id) => {
    if (!isLandingPage) return;
    event.preventDefault();
    scrollToSection(id);
  };

  const handleLanguageChange = (nextLang) => {
    setLocale(nextLang);
    setLangDropdownOpen(false);
    navigate(getAlternateLanguagePath(location.pathname, nextLang));
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8 lg:gap-12">
          <a href={getLandingPath(currentLang)} className="flex items-center gap-3 text-lg font-semibold tracking-[-0.04em] text-white">
            <img src="/logo.svg" alt="IteroJM" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            IteroJM
          </a>

          <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
            <a href={`${getLandingPath(currentLang)}#features`} onClick={(event) => handleSectionNav(event, 'features')} className="transition hover:text-white">
              {t('landing.features')}
            </a>
            <a href={`${getLandingPath(currentLang)}#ai-insights`} onClick={(event) => handleSectionNav(event, 'ai-insights')} className="transition hover:text-white">
              {AI_INSIGHTS_LABEL[currentLang]}
            </a>
            <a href={`${getLandingPath(currentLang)}#pricing`} onClick={(event) => handleSectionNav(event, 'pricing')} className="transition hover:text-white">
              {t('landing.pricing')}
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              onClick={() => setLangDropdownOpen((open) => !open)}
              className="flex min-w-[3rem] items-center justify-between gap-1 px-1.5 py-2 text-xs font-medium text-slate-200 transition hover:text-white sm:min-w-[3.75rem] sm:px-2.5 sm:text-sm"
              aria-expanded={langDropdownOpen}
              aria-haspopup="listbox"
            >
              <span>{currentLangLabel}</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', langDropdownOpen ? 'rotate-180' : '')} />
            </button>
            {langDropdownOpen ? (
              <ul
                className="absolute right-0 top-full z-50 mt-2 min-w-[10rem] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 py-2 shadow-[0_16px_50px_rgba(2,6,23,0.55)] backdrop-blur-2xl"
                role="listbox"
              >
                {LANG_OPTIONS.map((opt) => (
                  <li key={opt.code} role="option" aria-selected={currentLang === opt.code}>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange(opt.code)}
                      className={cn(
                        'w-full px-4 py-2 text-left text-sm transition',
                        currentLang === opt.code ? 'bg-white/[0.06] font-semibold text-white' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                      )}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <a
            href={APP_AUTH_HREF}
            className="rounded-xl px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05] hover:text-white sm:px-4 sm:text-sm"
          >
            {t('landing.logIn')}
          </a>
          <a
            href={APP_AUTH_HREF}
            className="hidden items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.35)] transition hover:from-violet-400 hover:to-sky-400 sm:inline-flex sm:px-5 sm:text-sm"
          >
            {t('landing.getStartedFree')}
          </a>
        </div>
      </div>
    </header>
  );
}
