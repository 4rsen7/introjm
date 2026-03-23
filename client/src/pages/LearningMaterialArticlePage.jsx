import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Clock3, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../services/auth';
import { API_BASE_URL } from '../config/api';
import { mapLearningMaterialToClient, useLearningMaterials } from '../hooks/useQueries';

const API_URL = API_BASE_URL;

const MATERIAL_TONES = {
  cobalt: {
    hero: 'from-slate-950 via-sky-950 to-indigo-900',
    glow: 'bg-sky-400/30',
    chip: 'bg-white/10 border-white/20 text-white/80',
    accent: 'text-sky-200',
  },
  emerald: {
    hero: 'from-emerald-950 via-teal-900 to-cyan-900',
    glow: 'bg-emerald-400/30',
    chip: 'bg-white/10 border-white/20 text-white/80',
    accent: 'text-emerald-200',
  },
  amber: {
    hero: 'from-stone-950 via-amber-900 to-orange-900',
    glow: 'bg-amber-400/30',
    chip: 'bg-white/10 border-white/20 text-white/80',
    accent: 'text-amber-100',
  },
  rose: {
    hero: 'from-slate-950 via-rose-950 to-fuchsia-900',
    glow: 'bg-rose-400/30',
    chip: 'bg-white/10 border-white/20 text-white/80',
    accent: 'text-rose-100',
  },
};

const getTone = (tone) => MATERIAL_TONES[tone] || MATERIAL_TONES.cobalt;

export default function LearningMaterialArticlePage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { data: materials = [] } = useLearningMaterials(true);

  const { data: material, isLoading } = useQuery({
    queryKey: ['learning_material', slug],
    queryFn: async () => {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/learning-materials/${slug}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || json.message || 'Failed to fetch learning material');
      return mapLearningMaterialToClient(json.data);
    },
    enabled: !!slug,
  });

  const relatedMaterials = useMemo(
    () => materials.filter((item) => item.slug !== slug).slice(0, 3),
    [materials, slug]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen app-shell-bg p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="h-[360px] animate-pulse rounded-[32px] bg-slate-900/90" />
          <div className="app-surface h-[420px] animate-pulse rounded-[28px]" />
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="min-h-screen app-shell-bg p-8">
        <div className="mx-auto max-w-4xl app-empty-state rounded-[28px] px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-sky-600 shadow-sm">
            <BookOpen size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('materials.notFoundTitle')}</h1>
          <p className="mt-3 text-sm leading-7 text-gray-600">{t('materials.notFoundDescription')}</p>
          <Link to="/materials" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            <ArrowLeft size={16} />
            {t('materials.backToLibrary')}
          </Link>
        </div>
      </div>
    );
  }

  const tone = getTone(material.heroTone);

  return (
    <div className="min-h-screen app-shell-bg p-8 font-sans text-gray-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className={`relative overflow-hidden rounded-[32px] bg-gradient-to-br ${tone.hero} px-8 py-10 text-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:px-10 sm:py-12`}>
          <div className={`absolute left-[-6rem] top-[-6rem] h-56 w-56 rounded-full blur-3xl ${tone.glow}`} />
          <div className={`absolute right-[-5rem] top-10 h-48 w-48 rounded-full blur-3xl ${tone.glow}`} />
          <div className="relative space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link to="/materials" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur">
                <ArrowLeft size={16} />
                {t('materials.backToLibrary')}
              </Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur">
                <Sparkles size={15} />
                {t('materials.library')}
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.chip}`}>
                  {material.category}
                </span>
                {material.featured && (
                  <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.chip}`}>
                    {t('materials.featured')}
                  </span>
                )}
              </div>
              <div className="max-w-4xl space-y-3">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{material.title}</h1>
                {material.subtitle && <p className="text-lg leading-8 text-white/78 sm:text-xl">{material.subtitle}</p>}
                <p className="max-w-3xl text-base leading-7 text-white/70">{material.excerpt}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-white/72">
              <span>{material.authorName}</span>
              <span>{material.publishedAtLabel}</span>
              <span className={`inline-flex items-center gap-1.5 ${tone.accent}`}>
                <Clock3 size={14} />
                {material.readingTimeMinutes ? t('materials.readingTime', { count: material.readingTimeMinutes }) : t('materials.readingTimeFallback')}
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="app-surface rounded-[28px] px-7 py-8 sm:px-10 sm:py-10">
            <div
              className="prose prose-slate prose-lg max-w-none prose-headings:font-black prose-headings:tracking-tight prose-h2:mt-12 prose-h2:text-3xl prose-h3:mt-8 prose-h3:text-xl prose-p:leading-8 prose-a:text-sky-700 prose-a:no-underline hover:prose-a:text-sky-800 prose-strong:text-slate-900 prose-ul:leading-8 prose-li:my-1"
              dangerouslySetInnerHTML={{ __html: material.bodyHtml || '' }}
            />
          </article>

          <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
            <div className="app-surface rounded-[24px] p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{t('materials.aboutCard')}</div>
              <div className="mt-4 space-y-4 text-sm text-gray-600">
                <div>
                  <div className="font-semibold text-gray-900">{material.authorName}</div>
                  <div>{t('materials.authorLabel')}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{material.category}</div>
                  <div>{t('materials.categoryLabel')}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{material.readingTimeMinutes ? t('materials.readingTime', { count: material.readingTimeMinutes }) : t('materials.readingTimeFallback')}</div>
                  <div>{t('materials.durationLabel')}</div>
                </div>
              </div>
            </div>

            {relatedMaterials.length > 0 && (
              <div className="app-surface rounded-[24px] p-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{t('materials.relatedTitle')}</div>
                <div className="mt-4 space-y-3">
                  {relatedMaterials.map((item) => (
                    <Link key={item.id} to={`/materials/${item.slug}`} className="group block rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-4 transition hover:border-gray-200 hover:bg-white">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">{item.category}</div>
                      <div className="mt-2 text-base font-bold tracking-tight text-gray-900">{item.title}</div>
                      <div className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-sky-700">
                        {t('materials.open')}
                        <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
