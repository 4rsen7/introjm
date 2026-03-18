import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, Map, Target, UserRound, Users2 } from 'lucide-react';
import SeoInternalLinksSection from '../components/common/SeoInternalLinksSection';

const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const pageHref = (lang) => `${LANDING_ORIGIN}/${lang}/persona-management-software`;

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
    title: 'Persona management software for product and CX teams',
    description:
      'Create personas, capture goals and frustrations, and keep them connected to journey maps inside one shared product workspace.',
    eyebrow: 'Persona management software',
    heroTitle: 'Keep personas useful, connected, and visible to the team.',
    heroSubtitle:
      'IteroJM gives product, CX, and service design teams a shared place to create personas, capture context, and keep persona work linked to journey maps instead of leaving it in static documents.',
    primaryCta: 'Start free',
    secondaryCta: 'Back to landing',
    highlights: [
      'Create personas with role, bio, location, goals, and frustrations',
      'Keep personas linked to the maps where they matter',
      'Share persona context with the same workspace used for journeys and research',
    ],
    sections: [
      {
        icon: UserRound,
        title: 'Create personas with practical product context',
        body:
          'IteroJM lets teams create personas with the fields that actually help product work move, including role, bio, location, goals, frustrations, and profile details.',
        bullets: [
          'Persona profiles with structured attributes',
          'Goals and frustrations stored directly in the persona',
          'A cleaner alternative to static persona slides',
        ],
      },
      {
        icon: Map,
        title: 'Keep personas tied to journey maps',
        body:
          'Personas are more useful when they stay connected to journey work. In IteroJM, personas can stay visible in the same workspace as the journey maps they inform.',
        bullets: [
          'Personas linked to maps in the workspace',
          'Better visibility into where each persona is used',
          'Less drift between persona docs and map decisions',
        ],
      },
      {
        icon: Target,
        title: 'Capture the signal behind user behavior',
        body:
          'Use personas to keep goals, motivations, frustrations, and role-based context visible when teams review customer journeys, evidence, and metrics.',
        bullets: [
          'Goals and frustrations stay close to the work',
          'A clearer view of who the team is designing for',
          'Useful context for product, CX, and service design decisions',
        ],
      },
      {
        icon: Users2,
        title: 'Share persona work across the same team workspace',
        body:
          'Instead of keeping personas in one tool and journeys in another, IteroJM keeps both in the same shared workspace so teams can work from the same customer context.',
        bullets: [
          'Shared workspace access for owners and members',
          'One place for personas, journeys, metrics, and interviews',
          'A more aligned handoff between research and product work',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Can I create detailed personas in IteroJM?',
        a: 'Yes. The product supports persona records with role, location, bio, goals, frustrations, and related profile details.',
      },
      {
        q: 'Can personas be connected to journey maps?',
        a: 'Yes. Personas live in the same workspace as journey maps and can be linked to the work where they are used.',
      },
      {
        q: 'Is this only for UX research teams?',
        a: 'No. IteroJM is designed for product, CX, research, and service design teams that need shared customer context.',
      },
      {
        q: 'Does IteroJM replace every research repository?',
        a: 'Not entirely. But it does help teams keep personas, journeys, metrics, and interviews in one shared workspace instead of scattering them across separate tools.',
      },
    ],
    footerLinks: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },
    seoTitle: 'IteroJM | Persona Management Software for Product Teams',
    seoDescription:
      'Persona management software for product and CX teams. Create personas, track goals and frustrations, and keep persona context linked to journey maps.',
  },
  uk: {
    title: 'Persona management software для product і CX-команд',
    description:
      'Створюйте personas, фіксуйте goals і frustrations та тримайте persona context пов’язаним із journey maps в одному shared workspace.',
    eyebrow: 'Persona management software',
    heroTitle: 'Тримайте personas корисними, пов’язаними й видимими для команди.',
    heroSubtitle:
      'IteroJM дає product, CX і service design командам спільне місце, де можна створювати personas, зберігати контекст і тримати persona-роботу пов’язаною з journey maps, а не в статичних документах.',
    primaryCta: 'Почати безкоштовно',
    secondaryCta: 'Назад на лендінг',
    highlights: [
      'Створюйте personas з role, bio, location, goals і frustrations',
      'Тримайте personas пов’язаними з мапами, де вони справді важливі',
      'Діліться persona context у тому самому workspace, що й journeys та research',
    ],
    sections: [
      {
        icon: UserRound,
        title: 'Створюйте personas з практичним product context',
        body:
          'IteroJM дозволяє створювати personas з полями, які реально допомагають product-команді працювати: role, bio, location, goals, frustrations та іншими профільними деталями.',
        bullets: [
          'Persona profiles зі структурованими атрибутами',
          'Goals і frustrations прямо всередині persona',
          'Акуратніша альтернатива статичним persona slides',
        ],
      },
      {
        icon: Map,
        title: 'Тримайте personas пов’язаними з journey maps',
        body:
          'Personas корисніші тоді, коли вони не живуть окремо від journey work. У IteroJM personas залишаються в тому самому workspace, що й journey maps, які вони допомагають пояснювати.',
        bullets: [
          'Personas, пов’язані з maps у workspace',
          'Краща видимість того, де використовується кожна persona',
          'Менше розриву між persona docs і map decisions',
        ],
      },
      {
        icon: Target,
        title: 'Фіксуйте signal за поведінкою користувача',
        body:
          'Використовуйте personas, щоб тримати goals, motivations, frustrations і рольовий context видимими, коли команда переглядає customer journeys, evidence та metrics.',
        bullets: [
          'Goals і frustrations поруч із реальною роботою',
          'Краще розуміння того, для кого команда проєктує досвід',
          'Корисний context для product, CX і service design-рішень',
        ],
      },
      {
        icon: Users2,
        title: 'Поширюйте persona-роботу в тому самому team workspace',
        body:
          'Замість того щоб тримати personas в одному інструменті, а journeys в іншому, IteroJM зберігає все в одному shared workspace, де команда працює з тим самим customer context.',
        bullets: [
          'Shared workspace access для owners і members',
          'Одне місце для personas, journeys, metrics і interviews',
          'Більш узгоджений handoff між research і product-роботою',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Чи можна створювати детальні personas в IteroJM?',
        a: 'Так. Продукт підтримує persona records з role, location, bio, goals, frustrations та іншими профільними деталями.',
      },
      {
        q: 'Чи можна пов’язати personas з journey maps?',
        a: 'Так. Personas живуть у тому самому workspace, що й journey maps, і можуть бути прив’язані до роботи, де вони використовуються.',
      },
      {
        q: 'Це лише для UX research команд?',
        a: 'Ні. IteroJM створений для product, CX, research і service design команд, яким потрібен shared customer context.',
      },
      {
        q: 'Чи замінює IteroJM будь-який research repository?',
        a: 'Не повністю. Але він допомагає тримати personas, journeys, metrics та interviews в одному shared workspace замість розкиданих окремих інструментів.',
      },
    ],
    footerLinks: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
    },
    seoTitle: 'IteroJM | Persona management software для product-команд',
    seoDescription:
      'Persona management software для product і CX-команд. Створюйте personas, зберігайте goals і frustrations та тримайте persona context пов’язаним із journey maps.',
  },
};

const relatedCopy = {
  en: {
    title: 'Explore related platform pages',
    description:
      'See how persona work connects to journey maps, metrics, interview evidence, and the wider research repository in IteroJM.',
  },
  uk: {
    title: 'Перегляньте пов’язані сторінки платформи',
    description:
      'Подивіться, як persona-робота поєднується з journey maps, metrics, interview evidence і ширшим research repository в IteroJM.',
  },
};

function SeoFeaturePageSection({ icon: Icon, title, body, bullets }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{title}</h2>
      <p className="mt-4 text-base leading-8 text-slate-300">{body}</p>
      <ul className="mt-6 space-y-3">
        {bullets.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-7 text-slate-200 sm:text-base">
            <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PersonaManagementSoftwarePage() {
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

    upsertJsonLd('persona-management-tech-article', {
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

    upsertJsonLd('persona-management-faq', {
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
            <UserRound className="h-4 w-4 text-fuchsia-300" />
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
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
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

        <SeoInternalLinksSection lang={lang} currentSlug="persona-management-software" {...relatedCopy[lang]} />
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
