const SEO_PAGES = {
  en: [
    {
      slug: 'customer-journey-map-software',
      eyebrow: 'Journey mapping',
      title: 'Customer journey map software',
      description: 'How IteroJM structures stages, lanes, cards, linked maps, personas, and evidence in one journey workspace.',
    },
    {
      slug: 'interview-transcription-and-insights',
      eyebrow: 'Interview insights',
      title: 'Interview transcription and AI insights',
      description: 'How teams record or upload interviews, generate transcripts, and review JTBD, pain points, and opportunity areas.',
    },
    {
      slug: 'journey-metrics-dashboard',
      eyebrow: 'Metrics',
      title: 'Journey metrics dashboard',
      description: 'How stage-level metrics, chart cards, and Google Sheets workflows stay close to the journey map context.',
    },
    {
      slug: 'persona-management-software',
      eyebrow: 'Personas',
      title: 'Persona management software',
      description: 'How persona profiles, goals, frustrations, and role context stay connected to journey work across the team.',
    },
    {
      slug: 'customer-research-repository',
      eyebrow: 'Research repository',
      title: 'Customer research repository',
      description: 'How interviews, transcripts, personas, maps, and metrics live in one shared workspace instead of scattered tools.',
    },
  ],
  uk: [
    {
      slug: 'customer-journey-map-software',
      eyebrow: 'Journey mapping',
      title: 'Customer journey map software',
      description: 'Як IteroJM структурує stages, lanes, cards, linked maps, personas і evidence в одному journey workspace.',
    },
    {
      slug: 'interview-transcription-and-insights',
      eyebrow: 'Interview insights',
      title: 'Interview transcription та AI insights',
      description: 'Як команди записують або завантажують interviews, отримують transcripts і переглядають JTBD, pain points та opportunity areas.',
    },
    {
      slug: 'journey-metrics-dashboard',
      eyebrow: 'Metrics',
      title: 'Journey metrics dashboard',
      description: 'Як stage-level metrics, chart cards і Google Sheets workflows лишаються поруч із контекстом journey map.',
    },
    {
      slug: 'persona-management-software',
      eyebrow: 'Personas',
      title: 'Persona management software',
      description: 'Як persona profiles, goals, frustrations і рольовий context залишаються пов’язаними з journey-роботою всієї команди.',
    },
    {
      slug: 'customer-research-repository',
      eyebrow: 'Research repository',
      title: 'Customer research repository',
      description: 'Як interviews, transcripts, personas, maps і metrics живуть в одному shared workspace замість розкиданих інструментів.',
    },
  ],
};

export function getSeoPageCatalog(lang = 'en') {
  return SEO_PAGES[lang] || SEO_PAGES.en;
}

export function getSeoPageHref(lang = 'en', slug) {
  return `/${lang}/${slug}`;
}
