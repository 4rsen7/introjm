import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, FileText, Gauge, Layers3, Users2 } from 'lucide-react';
import SeoInternalLinksSection from '../components/common/SeoInternalLinksSection';

const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const legalHref = (lang, slug) => `${LANDING_ORIGIN}/${lang}/${slug}`;
const pageHref = (lang) => `${LANDING_ORIGIN}/${lang}/customer-journey-map-software`;

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
    title: 'Customer Journey Map Software for Product and CX Teams',
    description:
      'IteroJM helps teams build customer journey maps, structure touchpoints and stages, connect personas and metrics, and keep research evidence in one shared workspace.',
    eyebrow: 'Customer journey map software',
    heroTitle: 'Map the full customer journey without rebuilding the same story in five tools.',
    heroSubtitle:
      'IteroJM gives product, CX, and service design teams one place to build customer journey maps, connect personas and metrics, attach evidence, and keep the map useful as the product evolves.',
    primaryCta: 'Start free',
    secondaryCta: 'Back to landing',
    highlights: [
      'Build structured journey maps with stages and lanes',
      'Connect personas, metrics, and linked map context',
      'Keep interview evidence and team decisions attached to the journey',
    ],
    sections: [
      {
        icon: Layers3,
        title: 'Create journey maps that stay usable',
        body:
          'Build maps with clear stages, lanes, cards, and linked blocks instead of static diagrams that break as soon as the team needs to update them.',
        bullets: [
          'Structured stage-based map editing',
          'Drag-and-drop card layout inside lanes',
          'Linked maps and reusable context blocks',
        ],
      },
      {
        icon: Users2,
        title: 'Keep the map connected to customer context',
        body:
          'Attach personas, pain points, touchpoints, and research context to the journey so the map stays relevant to real customer experience decisions.',
        bullets: [
          'Personas connected to journey work',
          'Stage-level pain points and opportunities',
          'Shared workspace visibility for owners and members',
        ],
      },
      {
        icon: Gauge,
        title: 'Connect metrics and external data',
        body:
          'Add metrics to the journey and sync supporting data sources so performance signals stay close to the moments in the experience that matter.',
        bullets: [
          'Metrics attached to journey stages',
          'Google Sheets integration for metric workflows',
          'A single view of qualitative and quantitative context',
        ],
      },
      {
        icon: FileText,
        title: 'Keep evidence close to the map',
        body:
          'Record or upload interviews, generate transcripts, and use AI-generated insights alongside your journey work instead of splitting evidence across separate tools.',
        bullets: [
          'Interview transcription inside the product',
          'AI summaries with JTBD, pain points, and opportunities',
          'Evidence that stays accessible from the same workspace',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Is IteroJM just a diagramming tool?',
        a: 'No. It is designed as customer journey map software that keeps maps, personas, metrics, and interview evidence connected in one workspace.',
      },
      {
        q: 'Can teams collaborate in the same journey map workspace?',
        a: 'Yes. Teams can work inside the same workspace with owner/member permissions and shared map visibility.',
      },
      {
        q: 'Can I connect journey maps to metrics?',
        a: 'Yes. IteroJM supports metrics attached to journey stages, including workflows that pull data from Google Sheets.',
      },
      {
        q: 'Does IteroJM support interview insights?',
        a: 'Yes. You can upload or record interviews, generate transcripts, and review AI-generated insights directly inside the product.',
      },
    ],
    footerLinks: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },
    seoTitle: 'IteroJM | Customer Journey Map Software for Product Teams',
    seoDescription:
      'Customer journey map software for product and CX teams. Build maps, connect personas and metrics, attach research evidence, and keep journey work in one shared workspace.',
  },
  uk: {
    title: 'Customer journey map software для product і CX-команд',
    description:
      'IteroJM допомагає командам будувати customer journey maps, структурувати touchpoints і stages, поєднувати personas та metrics і тримати research evidence в одному shared workspace.',
    eyebrow: 'Customer journey map software',
    heroTitle: 'Будуйте повний customer journey без постійного дублювання тієї самої історії в різних інструментах.',
    heroSubtitle:
      'IteroJM дає product, CX і service design командам одне місце, де можна будувати customer journey maps, поєднувати personas і metrics, прикріплювати evidence і тримати мапу корисною навіть коли продукт змінюється.',
    primaryCta: 'Почати безкоштовно',
    secondaryCta: 'Назад на лендінг',
    highlights: [
      'Будуйте структуровані journey maps зі stages і lanes',
      'Поєднуйте personas, metrics і linked map context',
      'Тримайте interview evidence і командні рішення поруч із journey',
    ],
    sections: [
      {
        icon: Layers3,
        title: 'Створюйте journey maps, з якими зручно працювати далі',
        body:
          'Будуйте мапи зі зрозумілими stages, lanes, cards і linked blocks замість статичних схем, які ламаються щоразу, коли команді потрібно щось оновити.',
        bullets: [
          'Структуроване редагування мап по етапах',
          'Drag-and-drop розкладка карток усередині lanes',
          'Linked maps і перевикористовувані контекстні блоки',
        ],
      },
      {
        icon: Users2,
        title: 'Тримайте customer context пов’язаним із мапою',
        body:
          'Прикріплюйте personas, pain points, touchpoints і research context до journey, щоб мапа залишалася корисною для реальних рішень у customer experience.',
        bullets: [
          'Personas, пов’язані з journey-роботою',
          'Pain points і opportunities по окремих stages',
          'Видимість у спільному workspace для owners і members',
        ],
      },
      {
        icon: Gauge,
        title: 'Поєднуйте метрики та зовнішні дані',
        body:
          'Додавайте metrics до journey і підтягуйте підтримувані джерела даних, щоб performance signals залишалися поруч із ключовими моментами experience.',
        bullets: [
          'Metrics, прив’язані до journey stages',
          'Google Sheets integration для metric workflows',
          'Єдине поле зору для qualitative і quantitative context',
        ],
      },
      {
        icon: FileText,
        title: 'Тримайте evidence поряд із мапою',
        body:
          'Записуйте або завантажуйте interviews, отримуйте transcripts і переглядайте AI-generated insights прямо в продукті, а не в окремих інструментах.',
        bullets: [
          'Interview transcription всередині продукту',
          'AI summaries з JTBD, pain points і opportunities',
          'Evidence, яке залишається доступним у тому самому workspace',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'IteroJM — це просто інструмент для схем?',
        a: 'Ні. Це customer journey map software, яке тримає мапи, personas, metrics і interview evidence в одному workspace.',
      },
      {
        q: 'Чи може команда працювати в одному journey map workspace?',
        a: 'Так. Команда працює в спільному workspace з ролями owner/member і загальною видимістю мап.',
      },
      {
        q: 'Чи можна поєднати journey maps з метриками?',
        a: 'Так. IteroJM підтримує metrics, прив’язані до stages, включно зі сценаріями на базі Google Sheets.',
      },
      {
        q: 'Чи підтримує IteroJM interview insights?',
        a: 'Так. Можна завантажувати або записувати interviews, отримувати transcripts і переглядати AI-generated insights прямо в продукті.',
      },
    ],
    footerLinks: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
    },
    seoTitle: 'IteroJM | Customer journey map software для product-команд',
    seoDescription:
      'Customer journey map software для product і CX-команд. Будуйте maps, поєднуйте personas і metrics, прикріплюйте research evidence та працюйте в одному shared workspace.',
  },
};

const relatedCopy = {
  en: {
    title: 'Explore related platform pages',
    description:
      'See how journey maps connect to interview insights, metrics, personas, and the broader research workspace across the rest of IteroJM.',
  },
  uk: {
    title: 'Перегляньте пов’язані сторінки платформи',
    description:
      'Подивіться, як journey maps поєднуються з interview insights, metrics, personas і ширшим research workspace в IteroJM.',
  },
};

function SeoFeaturePageSection({ icon: Icon, title, body, bullets }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/10 text-violet-100">
        <Icon className="h-5 w-5" />
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

export default function JourneyMapSoftwarePage() {
  const location = useLocation();
  const lang = location.pathname.startsWith('/uk/') ? 'uk' : 'en';
  const copy = copyByLang[lang];
  const appAuthHref = `${APP_ORIGIN}/auth`;

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.lang = lang;
    document.title = copy.seoTitle;

    upsertHeadLink('link[rel="canonical"]', {
      rel: 'canonical',
      href: pageHref(lang),
    });
    upsertHeadLink('link[rel="alternate"][hreflang="en"]', {
      rel: 'alternate',
      hreflang: 'en',
      href: pageHref('en'),
    });
    upsertHeadLink('link[rel="alternate"][hreflang="uk"]', {
      rel: 'alternate',
      hreflang: 'uk',
      href: pageHref('uk'),
    });
    upsertHeadLink('link[rel="alternate"][hreflang="x-default"]', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: pageHref('en'),
    });

    upsertHeadMeta('meta[name="description"]', {
      name: 'description',
      content: copy.seoDescription,
    });
    upsertHeadMeta('meta[property="og:type"]', {
      property: 'og:type',
      content: 'article',
    });
    upsertHeadMeta('meta[property="og:title"]', {
      property: 'og:title',
      content: copy.seoTitle,
    });
    upsertHeadMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: copy.seoDescription,
    });
    upsertHeadMeta('meta[property="og:url"]', {
      property: 'og:url',
      content: pageHref(lang),
    });
    upsertHeadMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: `${LANDING_ORIGIN}/promoCJM.png`,
    });
    upsertHeadMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    upsertHeadMeta('meta[name="twitter:title"]', {
      name: 'twitter:title',
      content: copy.seoTitle,
    });
    upsertHeadMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: copy.seoDescription,
    });
    upsertHeadMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: `${LANDING_ORIGIN}/promoCJM.png`,
    });

    upsertJsonLd('journey-map-software-page', {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: copy.seoTitle,
      description: copy.seoDescription,
      inLanguage: lang,
      url: pageHref(lang),
      about: ['customer journey mapping software', 'journey maps', 'personas', 'metrics', 'interview insights'],
    });
    upsertJsonLd('journey-map-software-faq', {
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
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80">
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

        <div className="mt-12 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_30px_90px_rgba(2,6,23,0.6)] sm:p-4">
          <img
            src="/promoCJM.png"
            alt="IteroJM customer journey mapping workspace"
            className="w-full rounded-[1.5rem] border border-white/10 bg-white object-contain"
          />
        </div>

        <div className="mt-14 grid gap-6">
          {copy.sections.map((section) => (
            <SeoFeaturePageSection key={section.title} {...section} />
          ))}
        </div>

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

        <SeoInternalLinksSection lang={lang} currentSlug="customer-journey-map-software" {...relatedCopy[lang]} />
      </main>

      <footer className="border-t border-white/10 bg-[#050712]/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 IteroJM</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link to={`/${lang}/terms`} className="transition-colors hover:text-white">
              {copy.footerLinks.terms}
            </Link>
            <Link to={`/${lang}/privacy`} className="transition-colors hover:text-white">
              {copy.footerLinks.privacy}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
