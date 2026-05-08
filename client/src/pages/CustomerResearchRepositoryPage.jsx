import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Archive, Check, FileStack, FolderSearch, Workflow, Wrench } from 'lucide-react';
import MarketingHeader from '../components/common/MarketingHeader';
import SeoInternalLinksSection from '../components/common/SeoInternalLinksSection';

const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const pageHref = (lang) => `${LANDING_ORIGIN}/${lang}/customer-research-repository`;

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
    title: 'Customer research repository for product and CX teams',
    description:
      'Keep interviews, transcripts, personas, journey maps, and metrics in one shared research workspace instead of scattering context across separate tools.',
    eyebrow: 'Customer research repository',
    heroTitle: 'Keep customer research in one place the team can actually use.',
    heroSubtitle:
      'IteroJM gives product, CX, research, and service design teams a shared workspace for interviews, transcripts, personas, journey maps, and metrics so the customer context stays connected.',
    primaryCta: 'Start free',
    secondaryCta: 'Back to landing',
    highlights: [
      'Store interviews, transcripts, personas, metrics, and maps together',
      'Reduce context loss between research and product teams',
      'Keep evidence visible without maintaining a separate repository stack',
    ],
    sections: [
      {
        icon: FileStack,
        title: 'Bring research artifacts into one workspace',
        body:
          'Instead of spreading interviews, personas, journey maps, and metrics across different tools, IteroJM keeps them in one workspace where teams can work with the same customer context.',
        bullets: [
          'Interviews, personas, metrics, and maps in one product',
          'Fewer handoff gaps between tools',
          'A simpler home for journey-related research work',
        ],
      },
      {
        icon: FolderSearch,
        title: 'Keep transcript and summary evidence searchable',
        body:
          'Recorded or uploaded interviews stay stored with transcript data and structured summaries, making it easier to revisit what users actually said when decisions need context.',
        bullets: [
          'Transcript lines saved per interview',
          'AI summaries structured into usable categories',
          'A clearer trail from research evidence to product discussion',
        ],
      },
      {
        icon: Workflow,
        title: 'Connect research to journeys, personas, and metrics',
        body:
          'A research repository is more useful when it is connected to the rest of the product workflow. IteroJM keeps journey work, personas, and metrics near the same evidence base.',
        bullets: [
          'Persona context available in the same workspace',
          'Journey maps and metrics stay close to evidence',
          'More continuity between insight and action',
        ],
      },
      {
        icon: Archive,
        title: 'Reduce fragmentation without adding another system to maintain',
        body:
          'IteroJM is not trying to be every research tool at once. It gives teams a practical repository layer for the customer context that is already needed in journey and product work.',
        bullets: [
          'A focused repository for journey-related research',
          'Shared access through owner/member workspace roles',
          'Less dependence on disconnected docs and folders',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Is IteroJM a customer research repository?',
        a: 'It can act as a practical research repository for teams that want interviews, personas, journey maps, and metrics in one shared workspace.',
      },
      {
        q: 'What research artifacts can be stored?',
        a: 'Teams can work with interviews, transcripts, AI summaries, personas, journey maps, and metrics inside the same workspace.',
      },
      {
        q: 'Does this replace every dedicated research ops platform?',
        a: 'Not necessarily. IteroJM is best positioned as a connected workspace for journey-related research context rather than a full replacement for every specialized repository tool.',
      },
      {
        q: 'Who is this most useful for?',
        a: 'It is especially useful for product, CX, research, and service design teams that need shared customer context tied to journey work.',
      },
    ],
    footerLinks: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },
    seoTitle: 'IteroJM | Customer Research Repository for Product Teams',
    seoDescription:
      'Customer research repository for product and CX teams. Keep interviews, transcripts, personas, journey maps, and metrics in one shared workspace.',
  },
  uk: {
    title: 'Customer research repository для product і CX-команд',
    description:
      'Тримайте interviews, transcripts, personas, journey maps і metrics в одному shared research workspace замість розкиданого context у різних інструментах.',
    eyebrow: 'Customer research repository',
    heroTitle: 'Тримайте customer research в одному місці, яким команда реально користується.',
    heroSubtitle:
      'IteroJM дає product, CX, research і service design командам shared workspace для interviews, transcripts, personas, journey maps і metrics, щоб customer context залишався пов’язаним.',
    primaryCta: 'Почати безкоштовно',
    secondaryCta: 'Назад на лендінг',
    highlights: [
      'Зберігайте interviews, transcripts, personas, metrics і maps разом',
      'Зменшуйте втрату context між research і product-командами',
      'Тримайте evidence видимим без окремого repository stack',
    ],
    sections: [
      {
        icon: FileStack,
        title: 'Зводьте research artifacts в один workspace',
        body:
          'Замість того щоб розкидати interviews, personas, journey maps і metrics по різних інструментах, IteroJM тримає їх в одному workspace, де команда працює з тим самим customer context.',
        bullets: [
          'Interviews, personas, metrics і maps в одному продукті',
          'Менше handoff gaps між інструментами',
          'Простіший дім для journey-related research work',
        ],
      },
      {
        icon: FolderSearch,
        title: 'Тримайте transcript і summary evidence searchable',
        body:
          'Записані або завантажені interviews зберігаються разом із transcript data та структурованими summaries, тож команді простіше повернутися до реальних слів користувачів.',
        bullets: [
          'Transcript lines зберігаються для кожного interview',
          'AI summaries структуровані в корисні категорії',
          'Зрозуміліший шлях від research evidence до product discussion',
        ],
      },
      {
        icon: Workflow,
        title: 'Поєднуйте research із journeys, personas і metrics',
        body:
          'Research repository цінніший тоді, коли він пов’язаний з іншою product-роботою. IteroJM тримає journey work, personas і metrics поруч із тією ж evidence base.',
        bullets: [
          'Persona context доступний у тому самому workspace',
          'Journey maps і metrics поруч з evidence',
          'Більше безперервності між insight і action',
        ],
      },
      {
        icon: Archive,
        title: 'Менше фрагментації без ще однієї системи для підтримки',
        body:
          'IteroJM не намагається бути будь-яким research tool одночасно. Він дає командам практичний repository layer для customer context, який уже потрібен у journey та product-роботі.',
        bullets: [
          'Фокусований repository для journey-related research',
          'Shared access через owner/member workspace roles',
          'Менша залежність від disconnected docs і folders',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Чи є IteroJM customer research repository?',
        a: 'Він може працювати як практичний research repository для команд, яким потрібно тримати interviews, personas, journey maps і metrics в одному shared workspace.',
      },
      {
        q: 'Які research artifacts тут можна зберігати?',
        a: 'Команди можуть працювати з interviews, transcripts, AI summaries, personas, journey maps і metrics в межах одного workspace.',
      },
      {
        q: 'Чи це повна заміна будь-якої research ops платформи?',
        a: 'Не обов’язково. IteroJM найкраще позиціонувати як connected workspace для journey-related research context, а не як повну заміну всіх спеціалізованих repository tools.',
      },
      {
        q: 'Для кого це найбільш корисно?',
        a: 'Найбільше користі це дає product, CX, research і service design командам, яким потрібен shared customer context, прив’язаний до journey work.',
      },
    ],
    footerLinks: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
    },
    seoTitle: 'IteroJM | Customer research repository для product-команд',
    seoDescription:
      'Customer research repository для product і CX-команд. Тримайте interviews, transcripts, personas, journey maps і metrics в одному shared workspace.',
  },
};

const relatedCopy = {
  en: {
    title: 'Explore related platform pages',
    description:
      'See how the research repository connects to journey maps, metrics, personas, and interview transcription across the rest of IteroJM.',
  },
  uk: {
    title: 'Перегляньте пов’язані сторінки платформи',
    description:
      'Подивіться, як research repository поєднується з journey maps, metrics, personas і interview transcription в IteroJM.',
  },
};

function SeoFeaturePageSection({ icon, title, body, bullets }) {
  const IconComponent = icon;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-500/10 text-indigo-100">
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

export default function CustomerResearchRepositoryPage() {
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

    upsertJsonLd('customer-research-repository-tech-article', {
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

    upsertJsonLd('customer-research-repository-faq', {
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
      <MarketingHeader lang={lang} />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-24 lg:pt-32">
        <section className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
            <Wrench className="h-4 w-4 text-indigo-300" />
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

        <SeoInternalLinksSection lang={lang} currentSlug="customer-research-repository" {...relatedCopy[lang]} />
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
