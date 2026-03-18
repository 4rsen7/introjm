import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getSeoPageCatalog, getSeoPageHref } from './seoPageCatalog';

export default function SeoInternalLinksSection({
  lang = 'en',
  currentSlug = '',
  title,
  description,
}) {
  const pages = getSeoPageCatalog(lang).filter((page) => page.slug !== currentSlug);

  if (pages.length === 0) return null;

  return (
    <section className="mt-16 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl sm:p-8">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">{title}</h2>
        <p className="mt-4 text-base leading-8 text-slate-300">{description}</p>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {pages.map((page) => (
          <Link
            key={page.slug}
            to={getSeoPageHref(lang, page.slug)}
            className="group rounded-[1.5rem] border border-white/10 bg-[#0b1022] px-5 py-5 transition hover:border-violet-300/20 hover:bg-white/[0.05]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/70">{page.eyebrow}</div>
            <div className="mt-3 flex items-start justify-between gap-4">
              <h3 className="text-lg font-medium text-white">{page.title}</h3>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-base">{page.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
