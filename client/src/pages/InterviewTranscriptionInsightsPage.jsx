import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BrainCircuit, Check, FileAudio, Mic, ScanSearch, UploadCloud } from 'lucide-react';
import SeoInternalLinksSection from '../components/common/SeoInternalLinksSection';

const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const pageHref = (lang) => `${LANDING_ORIGIN}/${lang}/interview-transcription-and-insights`;

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
    title: 'Interview transcription and AI insights for product research teams',
    description:
      'Record or upload interviews, generate transcripts, and review AI insights like JTBD, pain points, opportunity areas, and quotes in one shared workspace.',
    eyebrow: 'Interview transcription and insights',
    heroTitle: 'Turn raw interviews into searchable transcripts and structured product insights.',
    heroSubtitle:
      'IteroJM helps product, CX, and research teams capture interviews, generate transcripts, and turn qualitative input into JTBD, pain points, opportunity areas, and evidence-backed summaries.',
    primaryCta: 'Start free',
    secondaryCta: 'Back to landing',
    highlights: [
      'Run live interviews or upload recorded sessions',
      'Generate transcripts inside the same product workspace',
      'Review AI insights without moving evidence into another repository',
    ],
    sections: [
      {
        icon: Mic,
        title: 'Capture interviews in the workflow you already use',
        body:
          'Create interview sessions directly in the workspace, record live conversations, or upload existing audio and video files when research is already done.',
        bullets: [
          'Live interview mode inside the product',
          'Upload mode for existing recordings',
          'Interview sessions stored alongside product research work',
        ],
      },
      {
        icon: FileAudio,
        title: 'Generate transcripts that stay connected to the source',
        body:
          'IteroJM transcribes interviews into speaker-based transcript lines so teams can review what was said without exporting notes into another tool first.',
        bullets: [
          'Transcript lines stored with each interview',
          'Speaker-based transcript structure',
          'A single workspace for recordings and transcript review',
        ],
      },
      {
        icon: BrainCircuit,
        title: 'Use AI to structure the research signal',
        body:
          'Generate AI insights that summarize the interview and organize recurring patterns into job to be done, pain points, moments of friction, unmet needs, workarounds, opportunity areas, and quotes.',
        bullets: [
          'AI summaries generated from transcript evidence',
          'JTBD, pain points, and opportunity areas in one view',
          'Insight structure designed for product and CX decisions',
        ],
      },
      {
        icon: ScanSearch,
        title: 'Keep research visible to the rest of the team',
        body:
          'Instead of leaving interviews in a separate repository, keep them in the same workspace as journey maps, personas, and metrics so context is easier to share.',
        bullets: [
          'Interview evidence stays close to maps and personas',
          'Shared workspace access for owners and members',
          'A clearer path from qualitative research to team action',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Can I upload an interview instead of recording live?',
        a: 'Yes. IteroJM supports both live interview sessions and uploaded audio or video recordings.',
      },
      {
        q: 'Does IteroJM generate transcripts automatically?',
        a: 'Yes. Uploaded or recorded interviews can be turned into transcripts inside the product workspace.',
      },
      {
        q: 'What kinds of AI insights does IteroJM generate?',
        a: 'The product can generate structured summaries including JTBD, pain points, moments of friction, unmet needs, workarounds, opportunity areas, and quotes.',
      },
      {
        q: 'Do interview insights stay connected to the rest of the product work?',
        a: 'Yes. Interviews live in the same workspace as journey maps, personas, and metrics so teams do not need a separate research repository to access the context.',
      },
    ],
    footerLinks: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },
    seoTitle: 'IteroJM | Interview Transcription and AI Insights for Research Teams',
    seoDescription:
      'Interview transcription and AI insights for product and CX teams. Upload or record interviews, generate transcripts, and review JTBD, pain points, opportunity areas, and quotes.',
  },
  uk: {
    title: 'Interview transcription та AI insights для product research команд',
    description:
      'Записуйте або завантажуйте interviews, отримуйте transcripts і переглядайте AI insights на кшталт JTBD, pain points, opportunity areas та quotes в одному workspace.',
    eyebrow: 'Interview transcription and insights',
    heroTitle: 'Перетворюйте сирі інтерв’ю на searchable transcripts і структуровані product insights.',
    heroSubtitle:
      'IteroJM допомагає product, CX і research командам фіксувати interviews, отримувати transcripts і переводити qualitative input у JTBD, pain points, opportunity areas та evidence-backed summaries.',
    primaryCta: 'Почати безкоштовно',
    secondaryCta: 'Назад на лендінг',
    highlights: [
      'Проводьте live interviews або завантажуйте готові записи',
      'Отримуйте transcripts всередині того самого product workspace',
      'Переглядайте AI insights без перенесення evidence в окремий research repository',
    ],
    sections: [
      {
        icon: Mic,
        title: 'Фіксуйте interviews у тому workflow, який уже використовує команда',
        body:
          'Створюйте interview sessions прямо у workspace, записуйте live conversations або завантажуйте вже готові audio/video файли, коли research уже проведений.',
        bullets: [
          'Live interview mode всередині продукту',
          'Upload mode для готових записів',
          'Interview sessions, збережені поруч з іншою research-роботою',
        ],
      },
      {
        icon: FileAudio,
        title: 'Отримуйте transcripts, пов’язані з джерелом',
        body:
          'IteroJM перетворює interviews на transcript lines за спікерами, щоб команда бачила, що саме було сказано, без експорту нотаток в інший інструмент.',
        bullets: [
          'Transcript lines зберігаються всередині кожного interview',
          'Структура transcript за спікерами',
          'Єдиний workspace для записів і перегляду transcript',
        ],
      },
      {
        icon: BrainCircuit,
        title: 'Використовуйте AI, щоб структурувати research signal',
        body:
          'Генеруйте AI insights, які підсумовують interview і збирають recurring patterns у job to be done, pain points, moments of friction, unmet needs, workarounds, opportunity areas та quotes.',
        bullets: [
          'AI summaries, згенеровані з transcript evidence',
          'JTBD, pain points і opportunity areas в одному view',
          'Структура insights, корисна для product і CX-рішень',
        ],
      },
      {
        icon: ScanSearch,
        title: 'Тримайте research видимим для всієї команди',
        body:
          'Замість окремого research repository тримайте interviews у тому самому workspace, що й journey maps, personas і metrics, щоб контекст було простіше поширювати.',
        bullets: [
          'Interview evidence поруч із maps і personas',
          'Shared workspace access для owners і members',
          'Простіший шлях від qualitative research до дій команди',
        ],
      },
    ],
    faqTitle: 'FAQ',
    faqItems: [
      {
        q: 'Чи можна завантажити interview замість live запису?',
        a: 'Так. IteroJM підтримує і live interview sessions, і завантаження готових audio/video записів.',
      },
      {
        q: 'Чи генерує IteroJM transcript автоматично?',
        a: 'Так. Завантажені або записані interviews можна перетворити на transcript прямо всередині продукту.',
      },
      {
        q: 'Які саме AI insights генерує IteroJM?',
        a: 'Продукт може генерувати структуровані summaries з JTBD, pain points, moments of friction, unmet needs, workarounds, opportunity areas і quotes.',
      },
      {
        q: 'Чи залишаються interview insights пов’язаними з іншою product-роботою?',
        a: 'Так. Interviews живуть у тому самому workspace, що й journey maps, personas та metrics, тому команді не потрібне окреме сховище, щоб дістатися до контексту.',
      },
    ],
    footerLinks: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
    },
    seoTitle: 'IteroJM | Interview transcription та AI insights для research-команд',
    seoDescription:
      'Interview transcription та AI insights для product і CX-команд. Завантажуйте або записуйте interviews, отримуйте transcripts і переглядайте JTBD, pain points, opportunity areas та quotes.',
  },
};

const relatedCopy = {
  en: {
    title: 'Explore related platform pages',
    description:
      'See how interview transcription connects to journey maps, metrics, personas, and the wider research workspace inside IteroJM.',
  },
  uk: {
    title: 'Перегляньте пов’язані сторінки платформи',
    description:
      'Подивіться, як interview transcription поєднується з journey maps, metrics, personas і ширшим research workspace в IteroJM.',
  },
};

function SeoFeaturePageSection({ icon, title, body, bullets }) {
  const IconComponent = icon;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-500/10 text-sky-100">
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

export default function InterviewTranscriptionInsightsPage() {
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

    upsertJsonLd('interview-insights-tech-article', {
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

    upsertJsonLd('interview-insights-faq', {
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
            <UploadCloud className="h-4 w-4 text-sky-300" />
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

        <SeoInternalLinksSection lang={lang} currentSlug="interview-transcription-and-insights" {...relatedCopy[lang]} />
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
