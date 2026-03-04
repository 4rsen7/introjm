import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLocale } from '../i18n';
import {
  Map,
  Users,
  UsersRound,
  ArrowRight,
  Check,
  Sparkles,
  Zap,
  Shield,
  Mail,
  MapPin,
  ChevronDown,
  Smile,
  Meh,
} from 'lucide-react';
import MetricsIntegrationSection from '../components/common/MetricsIntegrationSection';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5005/api';

const scrollTo = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language?.startsWith('uk') ? 'uk' : 'en';
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);
  const pricingListRef = useRef(null);
  const langDropdownRef = useRef(null);

  useEffect(() => {
    setPlansLoading(true);
    setPlansError(null);
    fetch(`${API_URL}/plans?locale=${currentLang}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || 'Failed to load plans');
        return res.json();
      })
      .then((body) => {
        const list = body.status === 'success' && Array.isArray(body.data) ? body.data : [];
        setPlans(list);
      })
      .catch((err) => {
        setPlansError(err.message);
        setPlans([]);
      })
      .finally(() => setPlansLoading(false));
  }, [currentLang]);

  useEffect(() => {
    if (!langDropdownOpen) return;
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      setLangDropdownOpen(false);
    };

    const handleClick = (event) => {
      if (!langDropdownRef.current) return;
      if (!langDropdownRef.current.contains(event.target)) {
        setLangDropdownOpen(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('click', handleClick);
    };
  }, [langDropdownOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 640) return; // only adjust on mobile

    const container = pricingListRef.current;
    if (!container) return;

    const children = container.children;
    if (!children || children.length < 2) return;

    const middleCard = children[1];
    if (!middleCard || typeof middleCard.scrollIntoView !== 'function') return;

    middleCard.scrollIntoView({
      behavior: 'auto',
      block: 'nearest',
      inline: 'center',
    });
  }, [plansLoading, plansError, plans]);

  const formatPrice = (plan, cycle) => {
    const currency = plan.currency || 'USD';
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : currency + ' ';
    const amount = cycle === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly;
    if (amount == null) return null;
    return { sym, amount };
  };

  const getPlanStyle = (plan) => {
    const name = (plan.name || '').toLowerCase();
    if (name.includes('pro')) return { isPro: true, isEnterprise: false };
    if (name.includes('enterprise')) return { isPro: false, isEnterprise: true };
    return { isPro: false, isEnterprise: false };
  };

  const getPlanCta = (plan) => {
    const { isPro, isEnterprise } = getPlanStyle(plan);
    if (isEnterprise) return { type: 'link', labelKey: 'landing.upgradeToEnterprise' };
    if (isPro) return { type: 'link', labelKey: 'landing.upgradeToPro' };
    return { type: 'link', labelKey: 'landing.signUpFree' };
  };

  const langOptions = [
    { code: 'uk', label: 'UA' },
    { code: 'en', label: 'EN' },
  ];
  const currentLangLabel = langOptions.find((o) => o.code === currentLang)?.label ?? currentLang;

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 antialiased">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-slate-50/95 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/landing" className="flex items-center gap-2 font-bold text-xl tracking-tight text-slate-900">
            <img src="/logo.svg" alt="IteroJM" className="h-8 w-8 rounded-lg object-contain shrink-0" />
            IteroJM
          </Link>
          <nav className="hidden" aria-hidden>
            <button
              type="button"
              onClick={() => scrollTo('features')}
              className="min-w-[6rem] text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              {t('landing.features')}
            </button>
            <button
              type="button"
              onClick={() => scrollTo('pricing')}
              className="min-w-[6rem] text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              {t('landing.pricing')}
            </button>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative" ref={langDropdownRef}>
              <button
                type="button"
                onClick={() => setLangDropdownOpen((o) => !o)}
                className="flex min-w-[3.75rem] items-center justify-between rounded-lg bg-slate-100/80 px-2 py-2 text-xs sm:text-sm font-medium text-slate-700 ring-1 ring-slate-200/50 transition-all duration-200 ease-in-out hover:bg-slate-100 hover:text-slate-900"
                aria-expanded={langDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Оберіть мову"
              >
                <span>{currentLangLabel}</span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${langDropdownOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2}
                />
              </button>
              {langDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden
                    onClick={() => setLangDropdownOpen(false)}
                  />
                  <ul
                    className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200/60"
                    role="listbox"
                  >
                    {langOptions.map((opt) => (
                      <li key={opt.code} role="option" aria-selected={currentLang === opt.code}>
                        <button
                          type="button"
                          onClick={() => {
                            setLocale(opt.code);
                            setLangDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                            currentLang === opt.code
                              ? 'bg-slate-50 font-semibold text-slate-900'
                              : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <Link
              to="/auth"
              className="min-w-[4.5rem] sm:min-w-[5.5rem] rounded-lg px-3 sm:px-4 py-2 text-center text-xs sm:text-sm font-medium text-slate-700 transition hover:bg-slate-200/80 hover:text-slate-900"
            >
              {t('landing.logIn')}
            </Link>
            <Link
              to="/auth"
              className="hidden min-w-[11rem] rounded-lg bg-violet-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 sm:inline-flex sm:items-center sm:justify-center"
            >
              {t('landing.getStartedFree')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden px-4 pt-10 pb-16 sm:px-6 sm:pt-24 sm:pb-32 lg:px-8">
          <div className="mx-auto max-w-6xl text-center">
            <h1 className="relative z-10 pb-2 text-4xl font-bold leading-tight tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-900 via-slate-800 to-slate-500 sm:text-5xl lg:text-6xl">
              {t('landing.heroTitle')}
            </h1>
            <p className="relative z-0 mx-auto mt-8 max-w-2xl text-lg text-slate-600 sm:mt-10 sm:text-xl">
              {t('landing.heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:mt-10">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-6 py-3 text-base font-medium text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-700"
              >
                {t('landing.ctaStart')}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
              <button
                type="button"
                onClick={() => scrollTo('pricing')}
                className="inline-flex items-center rounded-lg border border-slate-200/60 bg-white px-6 py-3 text-base font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                {t('landing.ctaPricing')}
              </button>
            </div>
            {/* App preview — wide layout with glow (hidden on mobile) */}
            <div className="relative mx-auto mt-12 hidden max-w-5xl sm:mt-16 sm:block">
              <div className="absolute inset-0 -top-1/4 flex justify-center pointer-events-none" aria-hidden>
                <div className="h-[280px] w-[120%] max-w-4xl rounded-full bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 blur-3xl" />
              </div>
              <div className="relative overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-xl shadow-slate-200/40 ring-1 ring-slate-200/40 transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-2xl hover:shadow-slate-300/50">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-100/80 px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  </div>
                  <div className="ml-4 flex-1 rounded-md border border-slate-200/60 bg-white px-3 py-2 font-mono text-[11px] text-slate-400 sm:max-w-xs">
                    iterojm.app/editor/onboarding-journey
                  </div>
                </div>
                <div className="flex min-h-[320px] sm:min-h-[380px]">
                  {/* Sidebar */}
                  <aside className="hidden w-52 shrink-0 border-r border-slate-200/60 bg-slate-50/80 sm:block">
                    <div className="flex items-center gap-2.5 p-4">
                      <img src="/logo.svg" alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 h-2.5 w-20 rounded bg-slate-300" />
                        <div className="h-2 w-14 rounded bg-slate-200" />
                      </div>
                    </div>
                    <nav className="space-y-0.5 px-3 py-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                            i === 2 ? 'bg-slate-200/70' : ''
                          }`}
                        >
                          <div className="h-4 w-4 shrink-0 rounded bg-slate-200" />
                          <div
                            className="h-2.5 rounded bg-slate-200/80"
                            style={{ width: `${65 + (i % 3) * 12}%` }}
                          />
                        </div>
                      ))}
                    </nav>
                  </aside>
                  {/* Main content */}
                  <div className="min-w-0 flex-1 bg-slate-50/50 p-4 sm:p-6">
                    {/* Toolbar */}
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div className="h-6 w-28 rounded bg-slate-200 sm:w-32" />
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm" />
                        <div className="h-8 w-20 shrink-0 rounded-lg bg-violet-600 shadow-sm" />
                      </div>
                    </div>
                    {/* Colored stages row */}
                    <div className="mb-4 flex gap-4">
                      <div className="w-20 shrink-0 pt-2">
                        <div className="h-2.5 w-12 rounded bg-slate-400" />
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div className="flex h-9 items-center rounded-lg border-b-2 border-blue-200 bg-blue-100 px-3">
                          <div className="h-2 w-16 rounded bg-blue-300/80" />
                        </div>
                        <div className="flex h-9 items-center rounded-lg border-b-2 border-purple-200 bg-purple-100 px-3">
                          <div className="h-2 w-20 rounded bg-purple-300/80" />
                        </div>
                        <div className="flex h-9 items-center rounded-lg border-b-2 border-green-200 bg-green-100 px-3">
                          <div className="h-2 w-14 rounded bg-green-300/80" />
                        </div>
                      </div>
                    </div>
                    {/* Cards row */}
                    <div className="mb-4 flex gap-4">
                      <div className="w-20 shrink-0 pt-2">
                        <div className="h-2.5 w-16 rounded bg-slate-400" />
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <div
                            key={n}
                            className="rounded-lg border border-slate-200/60 bg-white p-4 shadow-sm"
                          >
                            <div className="mb-3 h-9 w-9 rounded-lg bg-slate-100" />
                            <div className="mb-1.5 h-2.5 w-4/5 rounded bg-slate-200" />
                            <div className="h-2 w-1/2 rounded bg-slate-100" />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Journey / emotion block */}
                    <div className="flex gap-4">
                      <div className="w-20 shrink-0 pt-2">
                        <div className="h-2.5 w-14 rounded bg-slate-400" />
                      </div>
                      <div className="relative h-28 flex-1 overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm sm:h-32">
                        <div className="absolute inset-0 grid grid-cols-3 divide-x divide-slate-50">
                          <div />
                          <div />
                          <div />
                        </div>
                        <div className="absolute inset-0 h-full w-full">
                          <svg
                            className="absolute inset-0 h-full w-full"
                            preserveAspectRatio="none"
                            viewBox="0 0 300 100"
                          >
                            <path
                              d="M 15,65 C 60,65 90,30 140,30 C 190,30 200,60 250,60"
                              fill="none"
                              stroke="#f97316"
                              strokeWidth="3"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          </svg>
                          <div className="absolute left-[46.66%] top-[30%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f97316] bg-white shadow-sm" />
                          <div className="absolute left-[83.33%] top-[60%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f97316] bg-white shadow-sm" />
                        </div>
                        <div className="absolute left-[46.66%] top-[12%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-100 bg-white p-0.5 shadow-sm">
                          <Smile size={14} className="text-green-500" />
                        </div>
                        <div className="absolute left-[83.33%] top-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-100 bg-white p-0.5 shadow-sm">
                          <Meh size={14} className="text-yellow-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className="border-t border-slate-200/60 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {t('landing.featuresTitle')}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
                {t('landing.featuresSubtitle')}
              </p>
            </div>
            <div className="mt-10 flex gap-4 overflow-x-auto snap-x snap-mandatory sm:mt-16 sm:grid sm:grid-cols-2 sm:gap-10 sm:overflow-visible lg:grid-cols-3">
              <div className="min-w-[80%] snap-start rounded-lg border border-slate-200/60 bg-slate-50/40 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/50 sm:min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Map className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-900">
                  {t('landing.feature1Title')}
                </h3>
                <p className="mt-3 text-slate-600">
                  {t('landing.feature1Desc')}
                </p>
              </div>
              <div className="min-w-[80%] snap-start rounded-lg border border-slate-200/60 bg-slate-50/40 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/50 sm:min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <Users className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-900">
                  {t('landing.feature2Title')}
                </h3>
                <p className="mt-3 text-slate-600">
                  {t('landing.feature2Desc')}
                </p>
              </div>
              <div className="min-w-[80%] snap-start rounded-lg border border-slate-200/60 bg-slate-50/40 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/50 sm:min-w-0 sm:col-span-2 lg:col-span-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                  <UsersRound className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-900">
                  {t('landing.feature3Title')}
                </h3>
                <p className="mt-3 text-slate-600">
                  {t('landing.feature3Desc')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <MetricsIntegrationSection />

        {/* ─── Pricing ─── */}
        <section id="pricing" className="border-t border-slate-200/60 bg-slate-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {t('landing.pricingTitle')}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
                {t('landing.pricingSubtitle')}
              </p>
              <div className="mt-8 inline-flex rounded-full border border-slate-200/60 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                    billingCycle === 'monthly'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('landing.monthly')}
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                    billingCycle === 'yearly'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('landing.yearly')}
                  <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                    {t('landing.save20')}
                  </span>
                </button>
              </div>
            </div>
            <div
              ref={pricingListRef}
              className="mt-10 flex gap-4 overflow-x-auto snap-x snap-mandatory sm:mt-14 sm:grid sm:gap-8 sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3"
            >
              {plansLoading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="flex min-w-[80%] snap-center flex-col rounded-lg border border-slate-200/60 bg-white p-8 shadow-sm sm:min-w-0">
                    <div className="h-5 w-5 rounded bg-slate-200" />
                    <div className="mt-6 h-9 w-24 rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-full rounded bg-slate-100" />
                    <div className="mt-8 space-y-3">
                      {[1, 2, 3, 4].map((j) => (
                        <div key={j} className="h-4 rounded bg-slate-100" style={{ width: `${60 + (j % 3) * 15}%` }} />
                      ))}
                    </div>
                    <div className="mt-8 h-10 w-full rounded-lg bg-slate-100" />
                  </div>
                ))
              ) : plansError || plans.length === 0 ? (
                /* Fallback: static content when API fails or returns no plans */
                <>
                  <div className="flex min-w-[80%] snap-center flex-col rounded-lg border border-slate-200/60 bg-white p-8 shadow-sm sm:min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-slate-500" />
                      <h3 className="text-lg font-semibold text-slate-900">{t('landing.free')}</h3>
                    </div>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-slate-900">$0</span>
                      <span className="text-slate-500">{t('landing.perMonth')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{t('landing.freeDesc')}</p>
                    <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-600">
                      {[t('landing.freeFeature1'), t('landing.freeFeature2'), t('landing.freeFeature3'), t('landing.freeFeature4')].map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link to="/auth" className="mt-8 block w-full rounded-lg border border-slate-200/60 bg-white py-3 text-center text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                      {t('landing.signUpFree')}
                    </Link>
                  </div>
                  <div className="relative flex min-w-[80%] snap-center flex-col rounded-lg border-2 border-violet-500 bg-white p-8 shadow-xl shadow-violet-500/10 sm:min-w-0">
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 sm:top-0 sm:-translate-y-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-[10px] sm:text-xs font-semibold text-white whitespace-nowrap">
                      {t('landing.mostPopular')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-slate-700" />
                      <h3 className="text-lg font-semibold text-slate-900">{t('landing.pro')}</h3>
                    </div>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-slate-900">{billingCycle === 'monthly' ? '$49' : '$470'}</span>
                      <span className="text-slate-500">{billingCycle === 'monthly' ? t('landing.perMonth') : t('landing.perYear')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{t('landing.proDesc')}</p>
                    <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-600">
                      {[t('landing.proFeature1'), t('landing.proFeature2'), t('landing.proFeature3'), t('landing.proFeature4')].map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link to="/auth" className="mt-8 block w-full rounded-lg bg-violet-600 py-3 text-center text-sm font-medium text-white transition hover:bg-violet-700">
                      {t('landing.upgradeToPro')}
                    </Link>
                  </div>
                  <div className="flex min-w-[80%] snap-center flex-col rounded-lg border border-slate-200/60 bg-white p-8 shadow-sm sm:min-w-0">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-slate-500" />
                      <h3 className="text-lg font-semibold text-slate-900">{t('landing.enterprise')}</h3>
                    </div>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-slate-900">{billingCycle === 'monthly' ? '$79' : '$760'}</span>
                      <span className="text-slate-500">{billingCycle === 'monthly' ? t('landing.perMonth') : t('landing.perYear')}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{t('landing.enterpriseDesc')}</p>
                    <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-600">
                      {[t('landing.enterpriseFeature1'), t('landing.enterpriseFeature2'), t('landing.enterpriseFeature3'), t('landing.enterpriseFeature4')].map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link to="/auth" className="mt-8 block w-full rounded-lg bg-slate-900 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-800">
                      {t('landing.upgradeToEnterprise')}
                    </Link>
                  </div>
                </>
              ) : (
                plans.slice(0, 3).map((plan) => {
                  const { isPro, isEnterprise } = getPlanStyle(plan);
                  const cta = getPlanCta(plan);
                  const priceInfo = formatPrice(plan, billingCycle);
                  const Icon = isPro ? Sparkles : isEnterprise ? Shield : Zap;
                  return (
                    <div
                      key={plan.id}
                      className={`relative flex min-w-[80%] snap-center flex-col rounded-lg bg-white p-8 shadow-sm sm:min-w-0 ${
                        isPro ? 'border-2 border-violet-500 shadow-xl shadow-violet-500/10' : 'border border-slate-200/60'
                      }`}
                    >
                      {isPro && (
                        <div className="absolute top-1 left-1/2 -translate-x-1/2 sm:top-0 sm:-translate-y-1/2 rounded-full bg-violet-500 px-3 py-0.5 text-[10px] sm:text-xs font-semibold text-white whitespace-nowrap">
                          {t('landing.mostPopular')}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${isPro ? 'text-slate-700' : 'text-slate-500'}`} />
                        <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                      </div>
                      <div className="mt-6 flex items-baseline gap-1">
                        {priceInfo ? (
                          <>
                            <span className="text-4xl font-bold text-slate-900">
                              {priceInfo.sym}{priceInfo.amount}
                            </span>
                            <span className="text-slate-500">
                              {billingCycle === 'monthly' ? t('landing.perMonth') : t('landing.perYear')}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                      )}
                      <ul className="mt-8 flex-1 space-y-3 text-sm text-slate-600">
                        {Array.isArray(plan.features) && plan.features.length > 0
                          ? plan.features.map((item) => (
                              <li key={item} className="flex items-center gap-2">
                                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                                {item}
                              </li>
                            ))
                          : null}
                      </ul>
                      <Link
                        to="/auth"
                        className={`mt-8 block w-full rounded-lg py-3 text-center text-sm font-medium transition ${
                          isPro
                            ? 'bg-violet-600 text-white hover:bg-violet-700'
                            : isEnterprise
                              ? 'bg-slate-900 text-white hover:bg-slate-800'
                              : 'border border-slate-200/60 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {t(cta.labelKey)}
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-slate-200/60 bg-white px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <p className="text-sm text-slate-500">
                {t('landing.copyright')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
                <Link to="/terms" className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
                  {t('landing.termsOfService')}
                </Link>
                <Link to="/privacy" className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
                  {t('landing.privacyPolicy')}
                </Link>
              </div>
              <div className="flex flex-col items-center gap-1 text-sm text-slate-600 sm:items-end">
                <a href="mailto:iterojm.app@gmail.com" className="inline-flex items-center gap-1.5 hover:text-slate-900">
                  <Mail className="h-4 w-4" />
                  iterojm.app@gmail.com
                </a>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  Kyiv, Ukraine
                </span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
