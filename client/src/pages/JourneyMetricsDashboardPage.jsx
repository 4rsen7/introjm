import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, Gauge, Link2, RefreshCw, Rows3 } from 'lucide-react';
import SeoInternalLinksSection from '../components/common/SeoInternalLinksSection';

const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const pageHref = (lang) => `${LANDING_ORIGIN}/${lang}/journey-metrics-dashboard`;

const upsertHeadLink = (selector, attrs) => {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('link');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    if (value != null) el.setAttribute(key, value);
  });
};

const upsertHeadMeta = (selector, attrs) => {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    if (value != null) el.setAttribute(key, value);
  });
};

const upsertJsonLd = (id, payload) => {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`script[data-seo-id="${id}"]`);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-seo-id', id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(payload);
};

const copyByLang = {
  en: {
    title: 'Journey metrics dashboard for product and CX teams',
    description:
      'Create journey metrics, connect Google Sheets data, and keep stage-level performance context close to your customer journey maps.',
    eyebrow: 'Journey metrics dashboard',
    heroTitle: 'Track journey performance without splitting the signal from the map.',
    heroSubtitle:
      'IteroJM helps teams create journey metrics, connect supporting data, and keep stage-level performance context visible alongside the journey, personas, and research evidence.',
    primaryCta: 'Start free',
    secondaryCta: 'Back to landing',
    highlights: [
      'Attach metrics to journey stages and customer moments',
      'Use manual values or connect Google Sheets data',
      'Keep qualitative and quantitative context in one workspace',
    ],
    sections: [
      {
        icon: Rows3,
        title: 'Build metrics around the journey, not in a separate dashboard',
        body:
          'Create metrics that reflect the stages and moments you care about instead of forcing teams to switch between a journey map and disconnected reporting views.',
        bullets: [
          'Metrics linked to journey stages',
          'A clearer relationship between performance and experience',
          'Reusable metric cards inside the same workspace',
        ],
      },
      {
        icon: Gauge,
        title: 'Support different metric formats',
        body:
          'IteroJM supports simple numeric metrics, comparisons, and series-based charts so teams can track signals like conversion, drop-off, NPS, and time-to-value in the format that fits the data.',
        bullets: [
          'Number, comparison, and series metric types',
          'Bar, line, area, pie, and donut chart support',
          'Stage-level visibility for journey KPIs',
        ],
      },
      {
        icon: Link2,
        title: 'Connect external spreadsheet workflows',
        body:
          'If teams already maintain operational metrics in Google Sheets, IteroJM can connect those workflows and sync the relevant ranges into product-facing metric cards.',
        bullets: [
          'Google Sheets connection for metric workflows',
          'Spreadsheet and range-based setup',
          'A simpler bridge between spreadsheets and journey work',
        ],
      },
      {
        icon: RefreshCw,
        title: 'Refresh context without rebuilding the metric every time',
        body:
          'Teams can update and sync metric data while keeping it attached to the same journey context, so the signal stays close to the work instead of living in a separate report.',
        bullets: [
          'Sync and refresh metric data inside the product',
          'Preview data before saving the metric setup',
          'A shared place for metric cards, maps, and personas',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Can I track journey metrics inside IteroJM?',
        a: 'Yes. IteroJM supports metrics attached to journey stages so teams can keep performance context inside the same workspace as the journey map.',
      },
      {
        q: 'What metric types are supported?',
        a: 'The product supports number, comparison, and series metrics, including common chart types for stage-level trend tracking.',
      },
      {
        q: 'Can I connect Google Sheets to metrics?',
        a: 'Yes. IteroJM includes a Google Sheets integration that can pull spreadsheet data into metric workflows.',
      },
      {
        q: 'Is this a full BI replacement?',
        a: 'No. IteroJM is designed to keep journey-related metrics close to the experience context, not to replace every reporting tool a company might use.',
      },
    ],
    footerLinks: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },
    seoTitle: 'IteroJM | Journey Metrics Dashboard for Product and CX Teams',
    seoDescription:
      'Journey metrics dashboard for product and CX teams. Track stage-level performance, connect Google Sheets data, and keep metrics tied to customer journey maps.',
  },
  uk: {
    title: 'Journey metrics dashboard для product і CX-команд',
    description:
      'Створюйте journey metrics, підключайте дані з Google Sheets і тримайте stage-level performance context поруч із customer journey maps.',
    eyebrow: 'Journey metrics dashboard',
    heroTitle: 'Відстежуйте performance journey без відриву signal від самої мапи.',
    heroSubtitle:
      'IteroJM допомагає командам створювати journey metrics, підключати supporting data і тримати stage-level performance context поруч із journey, personas та research evidence.',
    primaryCta: 'Почати безкоштовно',
    secondaryCta: 'Назад на лендінг',
    highlights: [
      'Прив’язуйте metrics до journey stages і customer moments',
      'Використовуйте manual values або Google Sheets data',
      'Тримайте qualitative і quantitative context в одному workspace',
    ],
    sections: [
      {
        icon: Rows3,
        title: 'Будуйте metrics навколо journey, а не в окремому dashboard',
        body:
          'Створюйте metrics, які відображають stages і моменти, що важливі для команди, замість постійного перемикання між journey map і відірваними звітами.',
        bullets: [
          'Metrics, прив’язані до journey stages',
          'Зрозуміліший зв’язок між performance та experience',
          'Перевикористовувані metric cards у тому самому workspace',
        ],
      },
      {
        icon: Gauge,
        title: 'Підтримуйте різні формати метрик',
        body:
          'IteroJM підтримує прості numeric metrics, comparison та series charts, щоб команда могла трекати conversion, drop-off, NPS чи time-to-value у відповідному форматі.',
        bullets: [
          'Типи Number, Comparison і Series',
          'Bar, line, area, pie та donut charts',
          'Видимість journey KPIs на рівні stages',
        ],
      },
      {
        icon: Link2,
        title: 'Підключайте зовнішні spreadsheet workflows',
        body:
          'Якщо команда вже веде operational metrics у Google Sheets, IteroJM може підключити цей workflow і синхронізувати релевантні ranges у product-facing metric cards.',
        bullets: [
          'Google Sheets connection для metric workflows',
          'Налаштування через spreadsheet і range',
          'Простіший міст між spreadsheets і journey-роботою',
        ],
      },
      {
        icon: RefreshCw,
        title: 'Оновлюйте контекст без перебудови метрики щоразу',
        body:
          'Команди можуть оновлювати й синхронізувати metric data, не відриваючи її від того самого journey context, щоб signal лишався поруч із роботою, а не в окремому звіті.',
        bullets: [
          'Sync і refresh metric data всередині продукту',
          'Preview даних до збереження metric setup',
          'Спільне місце для metric cards, maps і personas',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Чи можна трекати journey metrics всередині IteroJM?',
        a: 'Так. IteroJM підтримує metrics, прив’язані до journey stages, щоб performance context лишався в тому самому workspace, що й journey map.',
      },
      {
        q: 'Які типи метрик підтримуються?',
        a: 'Продукт підтримує number, comparison і series metrics, включно з поширеними chart types для stage-level trend tracking.',
      },
      {
        q: 'Чи можна підключити Google Sheets до metrics?',
        a: 'Так. В IteroJM є Google Sheets integration, яка може підтягувати spreadsheet data у metric workflows.',
      },
      {
        q: 'Чи це повна заміна BI-системи?',
        a: 'Ні. IteroJM створений для того, щоб тримати journey-related metrics поруч із experience context, а не замінювати всі reporting tools у компанії.',
      },
    ],
    footerLinks: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
    },
    seoTitle: 'IteroJM | Journey metrics dashboard для product і CX-команд',
    seoDescription:
      'Journey metrics dashboard для product і CX-команд. Тримайте stage-level performance, Google Sheets data та customer journey maps в одному workspace.',
  },
};

const relatedCopy = {
  en: {
    title: 'Explore related platform pages',
    description:
      'See how metrics stay connected to journey maps, interview evidence, personas, and the broader customer research workspace.',
  },
  uk: {
    title: 'Перегляньте пов’язані сторінки платформи',
    description:
      'Подивіться, як metrics залишаються пов’язаними з journey maps, interview evidence, personas і ширшим customer research workspace.',
  },
};

function SeoFeaturePageSection({ icon, title, body, bullets }) {
  const IconComponent = icon;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-500/10 text-cyan-100">
        <IconComponent className="h-5 w-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{title}</h2>
      <p className="mt-4 text-base leading-8 text-slate-300">{body}</p>
      <ul className="mt-6 space-y-3">
        {bullets.map((item) => (
          <li key={item} className="flex items-center gap-3 text-sm leading-7 text-slate-200 sm:text-base">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function JourneyMetricsDashboardPage() {
  const location = useLocation();
  const lang = location.pathname.startsWith('/uk/') ? 'uk' : 'en';
  const copy = copyByLang[lang];
  const appAuthHref = `${APP_ORIGIN}/auth`;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.lang = lang;
    document.title = copy.seoTitle;

    upsertHeadLink('link[rel="canonical"]', { rel: 'canonical', href: pageHref(lang) });
    upsertHeadLink('link[rel="alternate"][hreflang="en"]', { rel: 'alternate', hreflang: 'en', href: pageHref('en') });
    upsertHeadLink('link[rel="alternate"][hreflang="uk"]', { rel: 'alternate', hreflang: 'uk', href: pageHref('uk') });
    upsertHeadLink('link[rel="alternate"][hreflang="x-default"]', { rel: 'alternate', hreflang: 'x-default', href: pageHref('en') });

    upsertHeadMeta('meta[name="description"]', { name: 'description', content: copy.seoDescription });
    upsertHeadMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
    upsertHeadMeta('meta[property="og:title"]', { property: 'og:title', content: copy.seoTitle });
    upsertHeadMeta('meta[property="og:description"]', { property: 'og:description', content: copy.seoDescription });
    upsertHeadMeta('meta[property="og:url"]', { property: 'og:url', content: pageHref(lang) });
    upsertHeadMeta('meta[property="og:image"]', { property: 'og:image', content: `${LANDING_ORIGIN}/promoCJM.png` });
    upsertHeadMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertHeadMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: copy.seoTitle });
    upsertHeadMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: copy.seoDescription });
    upsertHeadMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: `${LANDING_ORIGIN}/promoCJM.png` });

    upsertJsonLd('journey-metrics-tech-article', {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: copy.title,
      description: copy.seoDescription,
      inLanguage: lang,
      mainEntityOfPage: pageHref(lang),
      publisher: {
        '@type': 'Organization',
        name: 'IteroJM',
        url: LANDING_ORIGIN,
        logo: `${LANDING_ORIGIN}/logo.png`,
      },
    });

    upsertJsonLd('journey-metrics-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: copy.faqItems.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    });
  }, [copy, lang]);

  return (
    <div className="min-h-screen bg-[#060814] text-white">
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <section className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
            <BarChart3 className="h-4 w-4 text-cyan-300" />
            {copy.eyebrow}
          </div>
          <h1 className="mt-8 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl lg:text-7xl">
            {copy.heroTitle}
          </h1>
          <p className="mx-auto mt-6 max-w-4xl text-lg leading-8 text-slate-300 sm:text-xl">
            {copy.heroSubtitle}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to={appAuthHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(59,130,246,0.35)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              {copy.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={lang === 'uk' ? '/uk' : '/en'}
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors duration-200 hover:bg-white/[0.07]"
            >
              {copy.secondaryCta}
            </Link>
          </div>
          <div className="mt-10 grid gap-4 text-left md:grid-cols-3">
            {copy.highlights.map((item) => (
              <div key={item} className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-4 text-sm leading-7 text-slate-200 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-2">
          {copy.sections.map((section) => (
            <SeoFeaturePageSection key={section.title} {...section} />
          ))}
        </section>

        <section className="mt-16 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white">{copy.faqTitle}</h2>
          <div className="mt-8 grid gap-4">
            {copy.faqItems.map((item) => (
              <div key={item.q} className="rounded-[1.5rem] border border-white/10 bg-[#0b1022] px-5 py-5">
                <h3 className="text-lg font-medium text-white">{item.q}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <SeoInternalLinksSection lang={lang} currentSlug="journey-metrics-dashboard" {...relatedCopy[lang]} />
      </main>

      <footer className="border-t border-white/10 bg-[#050712]/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 IteroJM</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link to={lang === 'uk' ? '/uk/terms' : '/en/terms'} className="transition-colors hover:text-white">
              {copy.footerLinks.terms}
            </Link>
            <Link to={lang === 'uk' ? '/uk/privacy' : '/en/privacy'} className="transition-colors hover:text-white">
              {copy.footerLinks.privacy}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
