import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLocale } from '../i18n';
import {
  ArrowRight,
  AudioLines,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  FileAudio2,
  Gauge,
  Mail,
  MapPin,
  Network,
  Shield,
  Sparkles,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { getSeoPageCatalog, getSeoPageHref } from '../components/common/seoPageCatalog';

const API_URL = API_BASE_URL;
const BROWSER_HOSTNAME = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
const IS_LOCAL_BROWSER = BROWSER_HOSTNAME === 'localhost' || BROWSER_HOSTNAME === '127.0.0.1';
const LANDING_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_LANDING_ORIGIN) || 'https://iterojm.com').replace(/\/$/, '');
const APP_ORIGIN = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ORIGIN) || 'https://app.iterojm.com').replace(/\/$/, '');
const APP_AUTH_HREF = IS_LOCAL_BROWSER ? '/auth' : `${APP_ORIGIN}/auth`;
const LANDING_PATH_BY_LANG = { en: '/en', uk: '/uk' };
const getLandingPath = (lang = 'en') => LANDING_PATH_BY_LANG[lang] || LANDING_PATH_BY_LANG.en;
const getLandingHref = (lang = 'en') => `${LANDING_ORIGIN}${getLandingPath(lang)}`;

const scrollTo = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const cn = (...parts) => parts.filter(Boolean).join(' ');
const stripTrailingHeadlinePeriod = (text) => (typeof text === 'string' ? text.replace(/\.$/, '') : text);
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

const enCopy = {
  heroEyebrow: 'Journey intelligence for modern product teams',
  heroTitle: 'From Chaos to Clarity for Every Customer Journey.',
  heroSubtitle:
    'IteroJM is customer journey mapping software for product and CX teams that turns fragmented research, scattered touchpoints, personas, metrics, and team decisions into one operational system.',
  heroPrimary: 'Start free',
  heroSecondary: 'Explore pricing',
  heroStats: ['Product teams', 'CX squads', 'Service designers', 'Research ops'],
  heroRouteLabel: 'app.iterojm.com/journey/clarity-map',
  floatingBadges: {
    persona: { label: 'Persona', title: 'Operations lead · shares context across the team' },
    jtbd: { label: 'JTBD', title: 'Keep every team aligned on the same journey logic' },
    painPoint: { label: 'Pain point', title: 'Research lives in six tools and two inboxes' },
    insight: { label: 'Insight', title: 'Drop-off peaks during handoff between onboarding steps' },
  },
  navAiInsights: 'AI Insights',
  featuresKicker: 'Customer journey map software',
  featuresTitle: 'Built to feel precise, premium, and impossible to outgrow.',
  featureLead: 'A journey mapping tool for product, CX, and service design teams working across research, personas, and metrics.',
  featureBlocks: [
    {
      id: 'collaborate',
      kicker: 'Collaborate in one shared workspace',
      title: 'One map. Multiple minds. Zero version chaos.',
      description:
        'Give product, design, research, and ops one shared journey mapping workspace where every change is visible, traceable, and aligned to the customer experience.',
      bullets: [
        'Shared journey editing with clear ownership across the team',
        'Workspace permissions for owners and members',
        'Structured map updates instead of whiteboard drift',
      ],
    },
    {
      id: 'dynamic',
      kicker: 'Dynamic journey maps',
      title: 'Move from static diagrams to an operating system for customer journeys.',
      description:
        'IteroJM connects journey maps, personas, metrics, linked maps, and stage-level context so the journey mapping process stays usable as products evolve.',
      bullets: [
        'Drag-and-drop CJM editing with structured lanes and stages',
        'Linked metrics, linked maps, and living documentation',
        'Built for large maps without turning into visual clutter',
      ],
    },
    {
      id: 'intelligence',
      kicker: 'Signal, not noise',
      title: 'See where friction lives and where the team should focus next.',
      description:
        'Bring customer research, interview insights, pain points, and performance weak spots into one view so teams can prioritize action instead of debating screenshots.',
      bullets: [
        'Map stage-level pain points and opportunities clearly',
        'Keep customer context visible through personas and evidence',
        'Track outcome signals alongside experience decisions',
      ],
    },
  ],
  aiKicker: 'New: AI insight pipeline',
  aiTitle: 'Turn User Voice Directly into Actionable Insights',
  aiSubtitle:
    'Upload or record interviews, generate transcripts, and turn qualitative research into JTBD, pain points, opportunities, and structured insight cards for faster product decisions.',
  collaborationMock: {
    title: 'Real-time journey workspace',
    subtitle: '3 teammates working in the same shared map workspace',
    stages: ['Discover', 'Evaluate', 'Adopt'],
    liveActionsTitle: 'Recent changes',
    actions: [
      ['↗', 'Maria', 'Moved a touchpoint card to “Evaluate”', 'text-sky-200'],
      ['✦', 'Alex', 'Attached a new persona insight to the shared map', 'text-violet-200'],
      ['◎', 'System', 'Updated a KPI card from the connected data source', 'text-emerald-200'],
    ],
  },
  dynamicMock: {
    title: 'Keep the journey map connected as evidence changes',
    liveSync: 'Always in context',
    metricsTitle: 'Connected metrics',
    conversionLabel: 'Conversion by stage',
    stages: [
      {
        name: 'Awareness',
        summary: 'Sync spreadsheet data with your journey map and keep research context visible.',
        items: [
          ['Pain point cluster', 'Handoff feels manual and hidden from the team.'],
          ['Improvement cue', 'Keep the next-step context visible after each update.'],
        ],
      },
      {
        name: 'Activation',
        summary: 'Connected blocks update without recreating the same map logic in multiple tools.',
        items: [
          ['Opportunity', 'Link interviews, personas, and touchpoints in one shared flow.'],
          ['Live update', 'Changes ripple through the workspace instead of breaking the story.'],
        ],
      },
      {
        name: 'Expansion',
        summary: 'Metrics stay attached to the journey so decisions are grounded in evidence.',
        items: [
          ['Signal', 'Connected KPIs make stage-level drop-off visible early.'],
          ['Action', 'Turn map context into a clearer next action for the team.'],
        ],
      },
    ],
  },
  intelligenceMock: {
    title: 'Decision context',
    subtitle: 'See friction, signal, and opportunity in one place',
    badge: 'prioritize',
    cards: [
      ['Pain point', 'Manual handoff breaks customer momentum', 'border-rose-300/20 bg-rose-400/10 text-rose-100'],
      ['Opportunity', 'Auto-share updates across workspace owners and members', 'border-sky-300/20 bg-sky-400/10 text-sky-100'],
      ['Next action', 'Ship handoff automation in onboarding settings', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'],
    ],
  },
  aiSection: {
    inputTitle: 'Input stream',
    inputSubtitle: 'Interview capture and transcript handoff',
    liveLabel: 'Live',
    interviewSession: 'Interview session',
    interviewSessionSubtitle: 'Customer onboarding experience review',
    transcriptPreview: 'Transcript preview',
    transcriptLines: [
      '“The team loses context every time the journey changes, so we end up recreating the same work in Miro, docs, and spreadsheets.”',
      '“I need one place where research, metrics, and actions stay connected instead of scattered.”',
    ],
    commandCenterTitle: 'AI insight workspace',
    commandCenterSubtitle: 'Structured output generated from raw interview evidence',
    cards: [
      ['Jobs-to-be-Done', 'User wants one shared source of truth for journey decisions.', 'border-sky-300/20 bg-sky-400/10 text-sky-50'],
      ['Pain Points', 'Current sharing flow is manual, hidden, and hard to maintain.', 'border-rose-300/20 bg-rose-400/10 text-rose-50'],
      ['Opportunities', 'Sync map changes, evidence, and next steps into a common workspace.', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-50'],
      ['Recommendations', 'Surface structured recommendations with stage-linked AI insight cards.', 'border-violet-300/20 bg-violet-400/10 text-violet-50'],
    ],
  },
  ctaKicker: 'Ready to move',
  ctaTitle: 'Build the journey layer your product team actually needs.',
  ctaSubtitle:
    'Map touchpoints, centralize interview evidence, connect personas and metrics, and move faster from insight to action.',
  deepDiveKicker: 'Feature deep dives',
  deepDiveTitle: 'Explore how each part of the workflow works in practice.',
  deepDiveSubtitle:
    'Go deeper into journey maps, interview transcription, metrics, personas, and research workflows without overloading the home page.',
  seoTitle: 'IteroJM | Customer Journey Mapping Software for Product Teams',
  seoDescription:
    'IteroJM is customer journey mapping software for product and CX teams. Map touchpoints, connect personas and metrics, centralize interview insights, and collaborate in one shared workspace.',
};

const ukCopy = {
  heroEyebrow: 'Journey intelligence для сучасних product-команд',
  heroTitle: 'Від хаосу до ясності в кожному customer journey.',
  heroSubtitle:
    'IteroJM — це customer journey mapping платформа для product і CX-команд, яка поєднує розрізнені дослідження, touchpoints, personas, metrics і командні рішення в одній системі.',
  heroPrimary: 'Почати безкоштовно',
  heroSecondary: 'Переглянути ціни',
  heroStats: ['Product-команди', 'CX-команди', 'Service design', 'Research ops'],
  heroRouteLabel: 'app.iterojm.com/journey/clarity-map',
  floatingBadges: {
    persona: { label: 'Persona', title: 'Operations lead · ділиться контекстом із командою' },
    jtbd: { label: 'JTBD', title: 'Тримати команду синхронізованою навколо однієї journey-логіки' },
    painPoint: { label: 'Pain point', title: 'Дослідження живуть у шести інструментах і двох inbox-ах' },
    insight: { label: 'Insight', title: 'Drop-off зростає під час handoff між onboarding-етапами' },
  },
  navAiInsights: 'AI інсайти',
  featuresKicker: 'Customer journey mapping platform',
  featuresTitle: 'Побудовано як точну, преміальну й масштабовану систему для product-команд.',
  featureLead: 'Journey mapping tool для product, CX і service design команд, які працюють із research, personas і metrics.',
  featureBlocks: [
    {
      id: 'collaborate',
      kicker: 'Спільна робота в єдиному workspace',
      title: 'Одна мапа. Кілька спеціалістів. Жодного хаосу з версіями.',
      description:
        'Дайте product, design, research і ops один спільний workspace для journey mapping, де кожна зміна видима, зрозуміла і прив’язана до customer experience.',
      bullets: [
        'Спільна робота з journey map у єдиному командному просторі',
        'Ролі owner/member для командної роботи',
        'Структуровані оновлення замість хаосу на whiteboard',
      ],
    },
    {
      id: 'dynamic',
      kicker: 'Динамічні journey maps',
      title: 'Перейдіть від статичних схем до операційної системи для customer journeys.',
      description:
        'IteroJM поєднує journey maps, personas, metrics, linked maps і контекст по етапах, щоб journey mapping лишався керованим навіть коли продукт ускладнюється.',
      bullets: [
        'Drag-and-drop CJM редактор зі структурованими лейнами й стадіями',
        'Пов’язані метрики, пов’язані мапи та жива документація',
        'Комфортна робота навіть із великими мапами',
      ],
    },
    {
      id: 'intelligence',
      kicker: 'Менше шуму, більше сигналу',
      title: 'Бачте, де саме виникає тертя і на чому команді варто сфокусуватись далі.',
      description:
        'Зводьте customer research, interview insights, pain points і слабкі місця в performance в одному місці, щоб команда пріоритизувала дії, а не сперечалась про скріни.',
      bullets: [
        'Чітко фіксуйте pain points і opportunity areas по етапах',
        'Тримайте customer context поруч через personas і evidence',
        'Поєднуйте signals та experience decisions в одній системі',
      ],
    },
  ],
  aiKicker: 'Нове: AI pipeline для інсайтів',
  aiTitle: 'Перетворюйте голос користувача на готові до дії інсайти',
  aiSubtitle:
    'Завантажуйте або записуйте інтерв’ю, отримуйте транскрипт і одразу перетворюйте qualitative research на JTBD, pain points, opportunities і структуровані insight cards для швидших продуктних рішень.',
  collaborationMock: {
    title: 'Спільний journey workspace',
    subtitle: '3 учасники команди працюють в одній мапі та бачать спільний контекст',
    stages: ['Discover', 'Evaluate', 'Adopt'],
    liveActionsTitle: 'Останні зміни',
    actions: [
      ['↗', 'Maria', 'Перемістила touchpoint-картку в етап “Evaluate”', 'text-sky-200'],
      ['✦', 'Alex', 'Додав новий persona insight до спільної мапи', 'text-violet-200'],
      ['◎', 'System', 'Оновив KPI-картку з підключеного джерела даних', 'text-emerald-200'],
    ],
  },
  dynamicMock: {
    title: 'Тримайте journey map пов’язаною, коли змінюється evidence',
    liveSync: 'Завжди в контексті',
    metricsTitle: 'Підключені метрики',
    conversionLabel: 'Конверсія по етапах',
    stages: [
      {
        name: 'Awareness',
        summary: 'Синхронізуйте spreadsheet-дані з journey map і зберігайте research context видимим.',
        items: [
          ['Pain point cluster', 'Handoff відчувається ручним і прихованим від команди.'],
          ['Improvement cue', 'Тримайте наступний контекстний крок видимим після кожного оновлення.'],
        ],
      },
      {
        name: 'Activation',
        summary: 'Пов’язані блоки оновлюються без повторного збирання тієї самої логіки мапи в різних інструментах.',
        items: [
          ['Opportunity', 'Зв’яжіть interviews, personas і touchpoints в одному спільному потоці.'],
          ['Live update', 'Зміни проходять крізь workspace, а не ламають цілісність історії.'],
        ],
      },
      {
        name: 'Expansion',
        summary: 'Метрики лишаються прив’язаними до journey, щоб рішення спиралися на evidence.',
        items: [
          ['Signal', 'Підключені KPI рано показують stage-level drop-off.'],
          ['Action', 'Перетворюйте контекст мапи на чіткіший наступний крок для команди.'],
        ],
      },
    ],
  },
  intelligenceMock: {
    title: 'Decision context',
    subtitle: 'Бачте friction, signal та opportunity в одному місці',
    badge: 'Prioritize',
    cards: [
      ['Pain point', 'Ручний handoff ламає customer momentum', 'border-rose-300/20 bg-rose-400/10 text-rose-100'],
      ['Opportunity', 'Auto-share оновлень між owners і members', 'border-sky-300/20 bg-sky-400/10 text-sky-100'],
      ['Next action', 'Запустити handoff automation в onboarding settings', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'],
    ],
  },
  aiSection: {
    inputTitle: 'Потік вхідних даних',
    inputSubtitle: 'Захоплення інтерв’ю та передача транскрипту',
    liveLabel: 'Live',
    interviewSession: 'Інтерв’ю-сесія',
    interviewSessionSubtitle: 'Огляд onboarding experience клієнта',
    transcriptPreview: 'Попередній перегляд транскрипту',
    transcriptLines: [
      '“Команда втрачає контекст щоразу, коли змінюється journey, тому ми відтворюємо ту саму роботу в Miro, docs і spreadsheets.”',
      '“Мені потрібне одне місце, де research, metrics і actions залишаються пов’язаними, а не розкиданими.”',
    ],
    commandCenterTitle: 'AI workspace для інсайтів',
    commandCenterSubtitle: 'Структурований output, згенерований із сирого interview evidence',
    cards: [
      ['Jobs-to-be-Done', 'Користувач хоче одне спільне source of truth для journey-рішень.', 'border-sky-300/20 bg-sky-400/10 text-sky-50'],
      ['Pain Points', 'Поточний sharing flow ручний, прихований і складний у підтримці.', 'border-rose-300/20 bg-rose-400/10 text-rose-50'],
      ['Opportunities', 'Синхронізуйте map changes, evidence та next steps у спільному workspace.', 'border-emerald-300/20 bg-emerald-400/10 text-emerald-50'],
      ['Recommendations', 'Отримуйте структуровані рекомендації через stage-linked AI insight cards.', 'border-violet-300/20 bg-violet-400/10 text-violet-50'],
    ],
  },
  ctaKicker: 'Готові рухатись далі',
  ctaTitle: 'Побудуйте journey layer, який справді потрібен вашій product-команді.',
  ctaSubtitle:
    'Мапуйте touchpoints, централізуйте interview evidence, поєднуйте personas і metrics та рухайтесь від інсайту до дії значно швидше.',
  deepDiveKicker: 'Детальніше про функціонал',
  deepDiveTitle: 'Подивіться, як окремі частини workflow працюють на практиці.',
  deepDiveSubtitle:
    'Розкрийте детальніше journey maps, interview transcription, metrics, personas і research workflows, не перевантажуючи home page.',
  seoTitle: 'IteroJM | Customer journey mapping платформа для product-команд',
  seoDescription:
    'IteroJM допомагає product і CX-командам будувати customer journey maps, поєднувати personas, metrics та interview insights і працювати в одному спільному workspace.',
};

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.16 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out will-change-transform',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ kicker, title, description, align = 'center' }) {
  return (
    <div className={cn('max-w-3xl', align === 'center' ? 'mx-auto text-center' : 'text-left')}>
      {kicker ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/80 backdrop-blur-xl">
          <Sparkles className="h-3.5 w-3.5" />
          {kicker}
        </div>
      ) : null}
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
        {stripTrailingHeadlinePeriod(title)}
      </h2>
      {description ? <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">{description}</p> : null}
    </div>
  );
}

function NetworkBackdrop() {
  const nodes = [
    { top: '10%', left: '8%', size: 8, delay: '0s' },
    { top: '18%', left: '48%', size: 10, delay: '1.2s' },
    { top: '24%', left: '78%', size: 9, delay: '0.6s' },
    { top: '42%', left: '22%', size: 8, delay: '1.8s' },
    { top: '54%', left: '66%', size: 12, delay: '0.9s' },
    { top: '70%', left: '15%', size: 10, delay: '1.5s' },
    { top: '76%', left: '52%', size: 8, delay: '0.3s' },
    { top: '82%', left: '85%', size: 7, delay: '1.1s' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,0.18),_transparent_34%),radial-gradient(circle_at_80%_15%,_rgba(59,130,246,0.14),_transparent_28%),radial-gradient(circle_at_50%_70%,_rgba(14,165,233,0.08),_transparent_38%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 1440 1200" fill="none" preserveAspectRatio="none">
        <path d="M108 180C292 218 350 352 541 382C744 416 789 246 988 258C1149 266 1242 370 1332 438" stroke="url(#lineA)" strokeWidth="1.2" />
        <path d="M156 812C294 724 458 612 640 650C826 688 922 860 1108 848C1226 840 1310 774 1388 686" stroke="url(#lineB)" strokeWidth="1.2" />
        <path d="M282 156C388 258 440 338 638 336C884 334 920 178 1180 190" stroke="url(#lineC)" strokeWidth="1" />
        <defs>
          <linearGradient id="lineA" x1="108" y1="180" x2="1332" y2="438" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(125,211,252,0.1)" />
            <stop offset="0.45" stopColor="rgba(167,139,250,0.8)" />
            <stop offset="1" stopColor="rgba(96,165,250,0.2)" />
          </linearGradient>
          <linearGradient id="lineB" x1="156" y1="812" x2="1388" y2="686" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(96,165,250,0.1)" />
            <stop offset="0.5" stopColor="rgba(59,130,246,0.7)" />
            <stop offset="1" stopColor="rgba(129,140,248,0.2)" />
          </linearGradient>
          <linearGradient id="lineC" x1="282" y1="156" x2="1180" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgba(196,181,253,0.1)" />
            <stop offset="0.5" stopColor="rgba(196,181,253,0.7)" />
            <stop offset="1" stopColor="rgba(14,165,233,0.15)" />
          </linearGradient>
        </defs>
      </svg>
      {nodes.map((node, index) => (
        <span
          key={`${node.top}-${node.left}-${index}`}
          className="absolute rounded-full border border-violet-300/30 bg-white/20 shadow-[0_0_24px_rgba(124,58,237,0.3)] animate-pulse"
          style={{
            top: node.top,
            left: node.left,
            width: `${node.size}px`,
            height: `${node.size}px`,
            animationDelay: node.delay,
            animationDuration: '3.8s',
          }}
        />
      ))}
    </div>
  );
}

function FloatingBadge({ className = '', label, title, tone = 'violet' }) {
  const toneClass =
    tone === 'blue'
      ? 'border-sky-300/20 bg-sky-500/10 text-sky-100 shadow-[0_0_50px_rgba(14,165,233,0.15)]'
      : tone === 'emerald'
        ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-50 shadow-[0_0_50px_rgba(16,185,129,0.14)]'
        : tone === 'amber'
          ? 'border-amber-300/20 bg-amber-500/10 text-amber-50 shadow-[0_0_50px_rgba(245,158,11,0.14)]'
          : 'border-violet-300/20 bg-violet-500/10 text-violet-50 shadow-[0_0_50px_rgba(124,58,237,0.18)]';

  return (
    <div className={cn('pointer-events-none rounded-2xl border px-4 py-3 backdrop-blur-2xl', toneClass, className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">{label}</div>
      <div className="mt-1 text-sm font-medium text-white/90">{title}</div>
    </div>
  );
}

function HeroVisual({ copy }) {
  return (
    <div className="relative mx-auto max-w-7xl">
      <div className="absolute inset-x-8 top-14 h-56 rounded-full bg-[radial-gradient(circle,_rgba(124,58,237,0.28),_transparent_60%)] blur-3xl" />
      <div className="relative rounded-[2rem] border border-white/10 bg-white/5 p-2 shadow-[0_20px_80px_rgba(15,23,42,0.6)] backdrop-blur-2xl sm:p-3">
        <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-3">
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.85)]" />
            {copy.heroRouteLabel}
          </div>
          <div className="relative overflow-hidden rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(10,15,28,1))] p-2 sm:p-3">
            <img
              src="/promoCJM.png"
              alt="IteroJM dashboard"
              className="w-full rounded-[1.1rem] border border-white/10 bg-white object-contain shadow-[0_12px_40px_rgba(15,23,42,0.35)]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,24,0.08),rgba(8,12,24,0.36))]" />
          </div>
        </div>

        <FloatingBadge
          className="absolute -left-36 top-14 hidden w-60 xl:block"
          label={copy.floatingBadges.persona.label}
          title={copy.floatingBadges.persona.title}
          tone="blue"
        />
        <FloatingBadge
          className="absolute -right-32 top-32 hidden w-52 lg:block"
          label={copy.floatingBadges.jtbd.label}
          title={copy.floatingBadges.jtbd.title}
          tone="violet"
        />
        <FloatingBadge
          className="absolute -bottom-10 -left-16 hidden w-52 lg:block"
          label={copy.floatingBadges.painPoint.label}
          title={copy.floatingBadges.painPoint.title}
          tone="amber"
        />
        <FloatingBadge
          className="absolute -bottom-12 -right-8 hidden w-56 xl:block"
          label={copy.floatingBadges.insight.label}
          title={copy.floatingBadges.insight.title}
          tone="emerald"
        />
      </div>
    </div>
  );
}

function CollaborationMock({ copy }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(11,17,31,1))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.6)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(124,58,237,0.22),transparent_35%)]" />
      <div className="relative rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">{copy.title}</div>
            <div className="mt-1 text-xs text-slate-400">{copy.subtitle}</div>
          </div>
          <div className="flex -space-x-3">
            {['#c4b5fd', '#60a5fa', '#34d399'].map((color) => (
              <div
                key={color}
                className="h-10 w-10 rounded-full border border-slate-900/80 shadow-[0_0_24px_rgba(255,255,255,0.12)]"
                style={{ background: `radial-gradient(circle at 30% 30%, ${color}, rgba(15,23,42,0.95))` }}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.3rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="mb-4 grid grid-cols-3 gap-3">
              {copy.stages.map((stage, index) => (
                <div
                  key={stage}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-center text-sm font-medium',
                    index === 0
                      ? 'border-sky-300/20 bg-sky-400/10 text-sky-100'
                      : index === 1
                        ? 'border-violet-300/20 bg-violet-400/10 text-violet-100'
                        : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                  )}
                >
                  {stage}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="min-h-[7.75rem] rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-2 h-8 w-8 rounded-xl bg-white/10" />
                  <div className="h-2.5 w-4/5 rounded-full bg-white/10" />
                  <div className="mt-2 h-2 w-1/2 rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.3rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="mb-3 text-sm font-semibold text-white">{copy.liveActionsTitle}</div>
            <div className="space-y-3">
              {copy.actions.map(([icon, user, text, userTone]) => (
                <div key={`${user}-${text}`} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="mt-0.5 text-lg text-slate-200">{icon}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className={cn('text-xs font-semibold uppercase tracking-[0.18em]', userTone)}>{user}</div>
                    <div className="text-sm leading-6 text-slate-200">{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DynamicMapMock({ copy }) {
  const stages = [
    {
      name: copy.stages[0].name,
      tone: 'border-sky-400/20 bg-sky-400/10 text-sky-100',
      summary: copy.stages[0].summary,
      items: copy.stages[0].items,
    },
    {
      name: copy.stages[1].name,
      tone: 'border-violet-400/20 bg-violet-400/10 text-violet-100',
      summary: copy.stages[1].summary,
      items: copy.stages[1].items,
    },
    {
      name: copy.stages[2].name,
      tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
      summary: copy.stages[2].summary,
      items: copy.stages[2].items,
    },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,27,0.96),rgba(5,10,20,1))] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.7)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,0.18),transparent_36%)]" />
      <div className="relative grid gap-4 xl:grid-cols-12">
        <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 xl:col-span-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-white">{copy.title}</div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              {copy.liveSync}
            </div>
          </div>
          <div className="space-y-3">
            {stages.map((stage) => (
              <div
                key={stage.name}
                className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 lg:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]"
              >
                <div className={cn('flex flex-col gap-3 rounded-2xl border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', stage.tone)}>
                  <div className="text-sm font-semibold text-white">{stage.name}</div>
                  <div className="text-sm leading-6 text-white/80">{stage.summary}</div>
                </div>
                <div className="grid min-w-0 gap-3">
                  {stage.items.map(([label, text], index) => (
                    <div
                      key={`${stage.name}-${label}`}
                      className={cn(
                        'flex min-w-0 flex-col gap-3 rounded-2xl border px-4 py-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                        index % 3 === 0
                          ? 'border-sky-400/15 bg-sky-400/8'
                          : index % 3 === 1
                            ? 'border-violet-400/15 bg-violet-400/8'
                            : 'border-emerald-400/15 bg-emerald-400/8'
                      )}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{label}</div>
                      <div className="text-sm leading-6 text-slate-200">{text}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4 xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">{copy.metricsTitle}</div>
            <Gauge className="h-4 w-4 text-slate-400" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
              <span>{copy.conversionLabel}</span>
              <span className="text-emerald-300">+14.2%</span>
            </div>
            <div className="relative h-40 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
              <div className="absolute inset-x-0 bottom-0 top-0 grid grid-cols-4 divide-x divide-white/5" />
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" fill="none" preserveAspectRatio="none">
                <path d="M20 110C64 110 78 86 116 84C154 82 186 58 224 60C262 62 294 96 332 94C360 92 372 70 380 58" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <div className="absolute left-[53%] top-[34.5%] h-3.5 w-3.5 rounded-full border-2 border-emerald-300 bg-slate-950 shadow-[0_0_24px_rgba(74,222,128,0.65)]" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['NPS', '+12'],
                ['Drop-off', '-19%'],
                ['Time to value', '-2.1d'],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                  <div className="text-lg font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntelligenceMock({ copy }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,19,33,0.96),rgba(6,11,22,1))] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.7)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,0.14),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(34,197,94,0.08),transparent_28%)]" />
      <div className="relative rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">{copy.title}</div>
            <div className="mt-1 text-xs text-slate-400">{copy.subtitle}</div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
            <WandSparkles className="h-3.5 w-3.5" />
            {copy.badge}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {copy.cards.map(([label, text, tone]) => (
            <div key={label} className={cn('rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', tone)}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{label}</div>
              <div className="mt-3 text-sm font-medium leading-6 text-white/90">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ id, copy }) {
  if (id === 'collaborate') return <CollaborationMock copy={copy.collaborationMock} />;
  if (id === 'dynamic') return <DynamicMapMock copy={copy.dynamicMock} />;
  return <IntelligenceMock copy={copy.intelligenceMock} />;
}

function FeatureBlock({ block, copy, reverse = false, delay = 0 }) {
  if (block.id === 'dynamic') {
    return (
      <Reveal delay={delay}>
        <div className="space-y-8">
          <div className="max-w-4xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
              <Network className="h-3.5 w-3.5 text-violet-300" />
              {block.kicker}
            </div>
            <h3 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl lg:text-[2.8rem]">
              {stripTrailingHeadlinePeriod(block.title)}
            </h3>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">{block.description}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <div className="flex min-h-[7.25rem] h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm leading-7 text-slate-200 sm:text-base">
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{block.bullets[0]}</span>
              </div>
            </div>
            <div>
              <div className="flex min-h-[7.25rem] h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm leading-7 text-slate-200 sm:text-base">
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{block.bullets[1]}</span>
              </div>
            </div>
            <div>
              <div className="flex min-h-[7.25rem] h-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm leading-7 text-slate-200 sm:text-base">
                <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{block.bullets[2]}</span>
              </div>
            </div>
          </div>
          <FeatureVisual id={block.id} copy={copy} />
        </div>
      </Reveal>
    );
  }

  if (block.id === 'intelligence') {
    return (
      <Reveal delay={delay}>
        <div className="grid gap-8 xl:grid-cols-12 xl:items-center">
          <div className="xl:col-span-7">
            <FeatureVisual id={block.id} copy={copy} />
          </div>
          <div className="xl:col-span-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
              <Network className="h-3.5 w-3.5 text-violet-300" />
              {block.kicker}
            </div>
            <h3 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{stripTrailingHeadlinePeriod(block.title)}</h3>
            <p className="mt-5 text-base leading-8 text-slate-300">{block.description}</p>
            <ul className="mt-6 space-y-4">
              {block.bullets.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm leading-7 text-slate-200 sm:text-base">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal delay={delay}>
      <div
        className={cn(
          'grid gap-8 xl:items-center',
          block.id === 'collaborate' ? 'xl:grid-cols-[1.08fr_0.92fr]' : 'xl:grid-cols-2',
          reverse ? 'xl:[&>*:first-child]:order-2' : ''
        )}
      >
          <FeatureVisual id={block.id} copy={copy} />
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">
            <Network className="h-3.5 w-3.5 text-violet-300" />
            {block.kicker}
          </div>
          <h3 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{stripTrailingHeadlinePeriod(block.title)}</h3>
          <p className="mt-5 text-base leading-8 text-slate-300">{block.description}</p>
          <ul className="mt-6 space-y-4">
            {block.bullets.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm leading-7 text-slate-200 sm:text-base">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}

function AiPipelineSection({ copy }) {
  return (
    <Reveal>
      <section id="ai-insights" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading kicker={copy.aiKicker} title={copy.aiTitle} description={copy.aiSubtitle} />
          <div className="mt-14 grid gap-6 xl:grid-cols-12">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.6)] backdrop-blur-2xl xl:col-span-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{copy.aiSection.inputTitle}</div>
                  <div className="mt-1 text-xs text-slate-400">{copy.aiSection.inputSubtitle}</div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-200">
                  <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_16px_rgba(248,113,113,0.8)]" />
                  {copy.aiSection.liveLabel}
                </div>
              </div>
              <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-slate-950/70 p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-violet-200">
                    <AudioLines className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{copy.aiSection.interviewSession}</div>
                    <div className="text-xs text-slate-400">{copy.aiSection.interviewSessionSubtitle}</div>
                  </div>
                </div>
                <div
                  className="mt-5 grid items-end gap-1 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4"
                  style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                >
                  {Array.from({ length: 24 }).map((_, index) => (
                    <span
                      key={index}
                      className="w-full rounded-full bg-gradient-to-t from-violet-400 via-sky-400 to-cyan-300"
                      style={{
                        height: `${12 + ((index * 13) % 34)}px`,
                        opacity: 0.45 + ((index % 5) * 0.1),
                      }}
                    />
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <FileAudio2 className="h-4 w-4" />
                    {copy.aiSection.transcriptPreview}
                  </div>
                  <div className="space-y-3 text-sm leading-6 text-slate-300">
                    {copy.aiSection.transcriptLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-violet-300/10 bg-[linear-gradient(180deg,rgba(16,23,37,0.88),rgba(9,14,26,0.98))] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.65)] xl:col-span-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{copy.aiSection.commandCenterTitle}</div>
                  <div className="mt-1 text-xs text-slate-400">{copy.aiSection.commandCenterSubtitle}</div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-100 shadow-[0_0_30px_rgba(124,58,237,0.18)]">
                  <Bot className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {copy.aiSection.cards.map(([label, text, tone]) => (
                  <div key={label} className={cn('min-w-0 rounded-[1.4rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', tone)}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{label}</div>
                      <BrainCircuit className="h-4 w-4 text-white/60" />
                    </div>
                    <p className="mt-4 text-sm leading-7 text-white/90">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function SeoDeepDiveSection({ copy, lang }) {
  const pages = getSeoPageCatalog(lang);

  return (
    <Reveal>
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading kicker={copy.deepDiveKicker} title={copy.deepDiveTitle} description={copy.deepDiveSubtitle} />
          <div className="mt-14 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.slug}
                to={getSeoPageHref(lang, page.slug)}
                className="group rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.5)] backdrop-blur-2xl transition hover:border-violet-300/20 hover:bg-white/[0.06]"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-200/70">{page.eyebrow}</div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">{page.title}</h3>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">{page.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function PricingCard({ plan, billingCycle, t, featured = false, authHref }) {
  const price = billingCycle === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly;
  const currency = plan.currency || 'USD';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'UAH' ? '₴' : `${currency} `;
  const isEnterprise = (plan.name || '').toLowerCase().includes('enterprise');
  const ctaLabel = isEnterprise ? t('landing.upgradeToEnterprise') : featured ? t('landing.upgradeToPro') : t('landing.signUpFree');

  return (
    <div
      className={cn(
        'relative flex min-w-[84%] snap-center flex-col overflow-hidden rounded-[2rem] border p-7 shadow-[0_20px_70px_rgba(2,6,23,0.48)] backdrop-blur-2xl sm:min-w-0',
        featured
          ? 'border-violet-300/25 bg-[linear-gradient(180deg,rgba(91,33,182,0.24),rgba(15,23,42,0.86))]'
          : 'border-white/10 bg-white/[0.04]'
      )}
    >
      {featured ? (
        <div className="absolute right-5 top-5 rounded-full border border-violet-200/20 bg-violet-400/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100">
          {t('landing.mostPopular')}
        </div>
      ) : null}
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-2xl',
            featured ? 'bg-white/12 text-violet-100' : 'bg-white/[0.05] text-slate-200'
          )}
        >
          {featured ? <Sparkles className="h-4 w-4" /> : isEnterprise ? <Shield className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
        </span>
        {plan.name}
      </div>
      <div className="mt-7 flex items-end gap-2">
        <div className="text-5xl font-semibold tracking-[-0.05em] text-white">
          {price != null ? `${symbol}${price}` : '—'}
        </div>
        <div className="pb-2 text-sm text-slate-400">{billingCycle === 'monthly' ? t('landing.perMonth') : t('landing.perYear')}</div>
      </div>
      {plan.description ? <p className="mt-3 text-sm leading-7 text-slate-300">{plan.description}</p> : null}
      <ul className="mt-8 flex-1 space-y-4">
        {(Array.isArray(plan.features) ? plan.features : []).map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-7 text-slate-200">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <a
        href={authHref}
        className={cn(
          'mt-8 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition',
          featured
            ? 'bg-white text-slate-950 hover:bg-violet-50'
            : isEnterprise
              ? 'bg-slate-100 text-slate-950 hover:bg-white'
              : 'border border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.09]'
        )}
      >
        {ctaLabel}
      </a>
    </div>
  );
}

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const currentLang = location.pathname.startsWith('/uk') ? 'uk' : 'en';
  const copy = currentLang === 'uk' ? ukCopy : enCopy;
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);
  const pricingListRef = useRef(null);
  const langDropdownRef = useRef(null);

  const fallbackPlans = useMemo(
    () => [
      {
        id: 'starter',
        name: t('landing.free'),
        description: t('landing.freeDesc'),
        price_monthly: 0,
        price_yearly: 0,
        currency: 'USD',
        features: [
          t('landing.freeFeature1'),
          t('landing.freeFeature2'),
          t('landing.freeFeature3'),
          t('landing.freeFeature4'),
        ],
      },
      {
        id: 'pro',
        name: t('landing.pro'),
        description: t('landing.proDesc'),
        price_monthly: 49,
        price_yearly: 470,
        currency: 'USD',
        features: [
          t('landing.proFeature1'),
          t('landing.proFeature2'),
          t('landing.proFeature3'),
          t('landing.proFeature4'),
        ],
      },
      {
        id: 'enterprise',
        name: t('landing.enterprise'),
        description: t('landing.enterpriseDesc'),
        price_monthly: 79,
        price_yearly: 760,
        currency: 'USD',
        features: [
          t('landing.enterpriseFeature1'),
          t('landing.enterpriseFeature2'),
          t('landing.enterpriseFeature3'),
          t('landing.enterpriseFeature4'),
        ],
      },
    ],
    [t]
  );

  useEffect(() => {
    let active = true;

    const loadPlans = async () => {
      setPlansLoading(true);
      setPlansError(null);

      try {
        const res = await fetch(`${API_URL}/plans?locale=${currentLang}`);
        if (!res.ok) throw new Error(res.statusText || 'Failed to load plans');

        const body = await res.json();
        if (!active) return;

        const list = body.status === 'success' && Array.isArray(body.data) ? body.data : [];
        setPlans(list);
      } catch (err) {
        if (!active) return;
        setPlansError(err.message);
        setPlans([]);
      } finally {
        if (active) {
          setPlansLoading(false);
        }
      }
    };

    queueMicrotask(() => {
      if (active) {
        void loadPlans();
      }
    });

    return () => {
      active = false;
    };
  }, [currentLang]);

  useEffect(() => {
    if (!langDropdownOpen) return undefined;

    const handleScroll = () => setLangDropdownOpen(false);
    const handleClick = (event) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
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
    if (typeof window === 'undefined' || window.innerWidth >= 640) return;
    const container = pricingListRef.current;
    if (!container) return;
    const children = container.children;
    if (!children || children.length < 2) return;
    const target = children[1];
    if (!target) return;

    const targetLeft = target.offsetLeft - (container.clientWidth - target.clientWidth) / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'auto' });
  }, [plansLoading, plansError, plans]);

  const langOptions = [
    { code: 'uk', label: 'UA' },
    { code: 'en', label: 'EN' },
  ];
  const currentLangLabel = langOptions.find((opt) => opt.code === currentLang)?.label ?? currentLang;
  const visiblePlans = !plansLoading && !plansError && plans.length > 0 ? plans.slice(0, 3) : fallbackPlans;

  useEffect(() => {
    if (i18n.language !== currentLang) {
      setLocale(currentLang);
    }
  }, [currentLang, i18n.language]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.documentElement.lang = currentLang;
    document.title = copy.seoTitle;

    upsertHeadLink('link[rel="canonical"]', {
      rel: 'canonical',
      href: getLandingHref(currentLang),
    });

    upsertHeadLink('link[rel="alternate"][hreflang="en"]', {
      rel: 'alternate',
      hreflang: 'en',
      href: getLandingHref('en'),
    });

    upsertHeadLink('link[rel="alternate"][hreflang="uk"]', {
      rel: 'alternate',
      hreflang: 'uk',
      href: getLandingHref('uk'),
    });

    upsertHeadLink('link[rel="alternate"][hreflang="x-default"]', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: getLandingHref('en'),
    });

    upsertHeadMeta('meta[name="description"]', {
      name: 'description',
      content: copy.seoDescription,
    });
    upsertHeadMeta('meta[property="og:type"]', {
      property: 'og:type',
      content: 'website',
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
      content: getLandingHref(currentLang),
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

    upsertJsonLd('organization', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'IteroJM',
      url: LANDING_ORIGIN,
      logo: `${LANDING_ORIGIN}/logo.png`,
    });
    upsertJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'IteroJM',
      url: LANDING_ORIGIN,
      inLanguage: currentLang,
    });
    upsertJsonLd('software-application', {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'IteroJM',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: getLandingHref(currentLang),
      description: copy.seoDescription,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    });
  }, [copy.seoDescription, copy.seoTitle, currentLang]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050816] text-white antialiased">
      <NetworkBackdrop />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8 lg:gap-12">
            <a href={getLandingPath(currentLang)} className="flex items-center gap-3 text-lg font-semibold tracking-[-0.04em] text-white">
              <img src="/logo.svg" alt="IteroJM" className="h-8 w-8 rounded-lg object-contain shrink-0" />
              IteroJM
            </a>

            <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex">
              <button type="button" onClick={() => scrollTo('features')} className="transition hover:text-white">
                {t('landing.features')}
              </button>
              <button type="button" onClick={() => scrollTo('ai-insights')} className="transition hover:text-white">
                {copy.navAiInsights}
              </button>
              <button type="button" onClick={() => scrollTo('pricing')} className="transition hover:text-white">
                {t('landing.pricing')}
              </button>
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
                  {langOptions.map((opt) => (
                    <li key={opt.code} role="option" aria-selected={currentLang === opt.code}>
                      <button
                        type="button"
                        onClick={() => {
                          navigate(getLandingPath(opt.code));
                          setLangDropdownOpen(false);
                        }}
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

      <main className="relative pt-16">
        <section className="px-4 pb-24 pt-12 sm:px-6 sm:pb-28 sm:pt-20 lg:px-8 lg:pt-24">
          <div className="mx-auto max-w-7xl">
            <Reveal className="text-center">
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-slate-300 backdrop-blur-2xl">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                {copy.heroEyebrow}
              </div>
              <h1 className="mx-auto mt-8 max-w-6xl text-balance text-5xl font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-7xl xl:max-w-[82rem] xl:text-[5.6rem]">
                {stripTrailingHeadlinePeriod(copy.heroTitle)}
              </h1>
              <p className="mx-auto mt-8 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
                {copy.heroSubtitle}
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <a
                  href={APP_AUTH_HREF}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-sky-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_36px_rgba(124,58,237,0.3)] transition hover:from-violet-400 hover:to-sky-400 sm:text-base"
                >
                  {copy.heroPrimary}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => scrollTo('pricing')}
                  className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-xl transition hover:bg-white/[0.08] sm:text-base"
                >
                  {copy.heroSecondary}
                </button>
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400 sm:gap-5">
                {copy.heroStats.map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">
                    {item}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal className="mt-14 sm:mt-16" delay={120}>
              <HeroVisual copy={copy} />
            </Reveal>
          </div>
        </section>

        <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHeading kicker={copy.featuresKicker} title={copy.featuresTitle} description={copy.featureLead} />
            <div className="mt-16 space-y-14">
              {copy.featureBlocks.map((block, index) => (
                <FeatureBlock key={block.id} block={block} copy={copy} reverse={index % 2 === 1} delay={index * 100} />
              ))}
            </div>
          </div>
        </section>

        <AiPipelineSection copy={copy} />
        <SeoDeepDiveSection copy={copy} lang={currentLang} />

        <Reveal>
          <section id="pricing" className="px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <SectionHeading kicker={t('landing.pricing')} title={t('landing.pricingTitle')} description={t('landing.pricingSubtitle')} />
              <div className="mt-8 flex justify-center">
                <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={cn(
                      'rounded-full px-5 py-2.5 text-sm font-semibold transition',
                      billingCycle === 'monthly' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    {t('landing.monthly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('yearly')}
                    className={cn(
                      'rounded-full px-5 py-2.5 text-sm font-semibold transition',
                      billingCycle === 'yearly' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    {t('landing.yearly')}
                    <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      {t('landing.save20')}
                    </span>
                  </button>
                </div>
              </div>

              <div ref={pricingListRef} className="mt-14 flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible lg:grid-cols-3">
                {plansLoading
                  ? [1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className="min-w-[84%] animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-2xl sm:min-w-0"
                      >
                        <div className="h-10 w-32 rounded-2xl bg-white/10" />
                        <div className="mt-8 h-12 w-36 rounded-2xl bg-white/10" />
                        <div className="mt-4 h-4 w-full rounded-full bg-white/5" />
                        <div className="mt-10 space-y-4">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-4 rounded-full bg-white/5" style={{ width: `${65 + i * 8}%` }} />
                          ))}
                        </div>
                      </div>
                    ))
                  : visiblePlans.map((plan, index) => (
                      <PricingCard
                        key={plan.id}
                        plan={plan}
                        billingCycle={billingCycle}
                        t={t}
                        featured={index === 1}
                        authHref={APP_AUTH_HREF}
                      />
                    ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl overflow-hidden rounded-[2.4rem] border border-violet-300/15 bg-[linear-gradient(135deg,rgba(91,33,182,0.24),rgba(15,23,42,0.95)_48%,rgba(2,132,199,0.16))] p-8 shadow-[0_20px_70px_rgba(2,6,23,0.7)] sm:p-12">
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-violet-100">
                    <WandSparkles className="h-3.5 w-3.5" />
                    {copy.ctaKicker}
                  </div>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">{stripTrailingHeadlinePeriod(copy.ctaTitle)}</h2>
                  <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">{copy.ctaSubtitle}</p>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row lg:justify-end">
                  <a
                    href={APP_AUTH_HREF}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-slate-950 transition hover:bg-violet-50"
                  >
                    {copy.heroPrimary}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => scrollTo('pricing')}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-4 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/[0.1]"
                  >
                    {copy.heroSecondary}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </Reveal>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/70 px-4 py-10 backdrop-blur-2xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3 text-sm font-semibold text-white">
              <img src="/logo.svg" alt="IteroJM" className="h-8 w-8 rounded-lg object-contain shrink-0" />
              IteroJM
            </div>
            <p className="mt-3 text-sm text-slate-400">{t('landing.copyright')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
            <Link to="/terms" className="transition hover:text-white">
              {t('landing.termsOfService')}
            </Link>
            <Link to="/privacy" className="transition hover:text-white">
              {t('landing.privacyPolicy')}
            </Link>
          </div>

          <div className="flex flex-col gap-2 text-sm text-slate-400 sm:items-end">
            <a href="mailto:info@iterojm.com" className="inline-flex items-center gap-2 transition hover:text-white">
              <Mail className="h-4 w-4" />
              info@iterojm.com
            </a>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Kyiv, Ukraine
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
