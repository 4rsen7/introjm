import { BookOpen, Clock3, ArrowRight, Sparkles, GraduationCap, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useLearningMaterials } from '../hooks/useQueries';

const MATERIAL_TONES = {
  cobalt: {
    shell: 'from-sky-500/18 via-indigo-500/12 to-white',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    glow: 'bg-sky-500/18',
    accent: 'text-sky-700',
  },
  emerald: {
    shell: 'from-emerald-500/16 via-teal-500/10 to-white',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    glow: 'bg-emerald-500/18',
    accent: 'text-emerald-700',
  },
  amber: {
    shell: 'from-amber-400/18 via-orange-400/12 to-white',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    glow: 'bg-amber-500/18',
    accent: 'text-amber-700',
  },
  rose: {
    shell: 'from-rose-400/18 via-fuchsia-400/10 to-white',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    glow: 'bg-rose-500/18',
    accent: 'text-rose-700',
  },
};

const getTone = (tone) => MATERIAL_TONES[tone] || MATERIAL_TONES.cobalt;

export default function LearningMaterialsPage() {
  const { t } = useTranslation();
  const { data: materials = [], isLoading } = useLearningMaterials(true);

  const featuredMaterial = useMemo(
    () => materials.find((item) => item.featured) || materials[0] || null,
    [materials]
  );
  const remainingMaterials = useMemo(
    () => materials.filter((item) => item.id !== featuredMaterial?.id),
    [materials, featuredMaterial]
  );

  return (
    <div className="min-h-screen app-shell-bg p-8 font-sans text-gray-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="app-surface overflow-hidden rounded-[28px] border border-white/70">
          <div className="relative px-8 py-10 sm:px-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.16),transparent_22%),radial-gradient(circle_at_30%_100%,rgba(249,115,22,0.12),transparent_26%)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                  <GraduationCap size={14} />
                  {t('materials.eyebrow')}
                </div>
                <div className="space-y-3">
                  <h1 className="max-w-3xl text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
                    {t('materials.title')}
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-gray-600 sm:text-lg">
                    {t('materials.subtitle')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="app-surface-soft rounded-2xl px-4 py-3 text-sm text-gray-600">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{t('materials.statPublished')}</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{materials.length}</div>
                  </div>
                  <div className="app-surface-soft rounded-2xl px-4 py-3 text-sm text-gray-600">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{t('materials.statFeatured')}</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{materials.filter((item) => item.featured).length}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { iconElement: <BookOpen size={18} className="mb-3 text-gray-700" />, label: t('materials.highlight1') },
                  { iconElement: <Sparkles size={18} className="mb-3 text-gray-700" />, label: t('materials.highlight2') },
                  { iconElement: <Layers3 size={18} className="mb-3 text-gray-700" />, label: t('materials.highlight3') },
                ].map(({ iconElement, label }) => (
                  <div key={label} className="app-surface-soft rounded-2xl border border-white/80 px-4 py-4">
                    {iconElement}
                    <div className="text-sm leading-6 text-gray-600">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="app-surface h-[360px] animate-pulse rounded-[28px]" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              <div className="app-surface h-[168px] animate-pulse rounded-[24px]" />
              <div className="app-surface h-[168px] animate-pulse rounded-[24px]" />
            </div>
          </div>
        ) : featuredMaterial ? (
          <section className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
            <FeaturedMaterialCard material={featuredMaterial} t={t} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              {remainingMaterials.slice(0, 2).map((material) => (
                <CompactMaterialCard key={material.id} material={material} t={t} />
              ))}
            </div>
          </section>
        ) : (
          <div className="app-empty-state rounded-[28px] px-8 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-sky-600 shadow-sm">
              <BookOpen size={28} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{t('materials.emptyTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-gray-600">{t('materials.emptyDescription')}</p>
          </div>
        )}

        {remainingMaterials.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t('materials.moreTitle')}</h2>
                <p className="mt-1 text-sm text-gray-500">{t('materials.moreDescription')}</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {remainingMaterials.slice(2).map((material) => (
                <MaterialGridCard key={material.id} material={material} t={t} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function FeaturedMaterialCard({ material, t }) {
  const tone = getTone(material.heroTone);

  return (
    <Link
      to={`/materials/${material.slug}`}
      className={`app-surface group relative overflow-hidden rounded-[28px] bg-gradient-to-br ${tone.shell} p-8 transition-transform duration-300 hover:-translate-y-1`}
    >
      <div className={`absolute right-[-6rem] top-[-6rem] h-56 w-56 rounded-full blur-3xl ${tone.glow}`} />
      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.badge}`}>
              {material.category}
            </span>
            {material.featured && (
              <span className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-600">
                {t('materials.featured')}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="max-w-3xl text-3xl font-black tracking-tight text-gray-900 sm:text-[2.5rem]">
              {material.title}
            </h2>
            {material.subtitle && <p className="max-w-2xl text-lg font-medium text-gray-700">{material.subtitle}</p>}
            <p className="max-w-2xl text-sm leading-7 text-gray-600 sm:text-base">{material.excerpt}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/70 pt-5">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span>{material.authorName}</span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={14} />
              {material.readingTimeMinutes ? t('materials.readingTime', { count: material.readingTimeMinutes }) : t('materials.readingTimeFallback')}
            </span>
            <span>{material.publishedAtLabel}</span>
          </div>
          <span className={`inline-flex items-center gap-2 text-sm font-semibold ${tone.accent}`}>
            {t('materials.readMaterial')}
            <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function CompactMaterialCard({ material, t }) {
  const tone = getTone(material.heroTone);

  return (
    <Link
      to={`/materials/${material.slug}`}
      className={`app-surface group relative overflow-hidden rounded-[24px] bg-gradient-to-br ${tone.shell} px-6 py-6 transition-transform duration-300 hover:-translate-y-1`}
    >
      <div className={`absolute right-[-3rem] top-[-3rem] h-28 w-28 rounded-full blur-2xl ${tone.glow}`} />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.badge}`}>
            {material.category}
          </span>
          <span className="text-xs text-gray-500">{material.publishedAtLabel}</span>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight text-gray-900">{material.title}</h3>
          <p className="text-sm leading-6 text-gray-600">{material.excerpt}</p>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{material.authorName}</span>
          <span className={`inline-flex items-center gap-2 font-semibold ${tone.accent}`}>
            {t('materials.open')}
            <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function MaterialGridCard({ material, t }) {
  const tone = getTone(material.heroTone);

  return (
    <Link to={`/materials/${material.slug}`} className="group block">
      <article className="app-surface relative overflow-hidden rounded-[24px] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
        <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${tone.shell}`} />
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.badge}`}>
              {material.category}
            </span>
            {material.featured && (
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                {t('materials.featured')}
              </span>
            )}
          </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight text-gray-900">{material.title}</h3>
              {material.subtitle && <p className="text-sm font-medium text-gray-700">{material.subtitle}</p>}
              <p className="text-sm leading-7 text-gray-600">{material.excerpt}</p>
            </div>

          <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
            <div className="space-y-1">
              <div>{material.authorName}</div>
              <div>{material.publishedAtLabel}</div>
            </div>
            <div className={`inline-flex items-center gap-2 font-semibold ${tone.accent}`}>
              {t('materials.readMaterial')}
              <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
