import React from 'react';
import { useTranslation } from 'react-i18next';
import { Table, FileSpreadsheet, BarChart3 } from 'lucide-react';

export default function MetricsIntegrationSection() {
  const { t } = useTranslation();

  const cards = [
    {
      id: 'googleSheets',
      Icon: Table,
      title: t('landing.metricsSection.cards.googleSheets.title'),
      text: t('landing.metricsSection.cards.googleSheets.text'),
    },
    {
      id: 'excel',
      Icon: FileSpreadsheet,
      title: t('landing.metricsSection.cards.excel.title'),
      text: t('landing.metricsSection.cards.excel.text'),
    },
    {
      id: 'powerBi',
      Icon: BarChart3,
      title: t('landing.metricsSection.cards.powerBi.title'),
      text: t('landing.metricsSection.cards.powerBi.text'),
    },
  ];

  return (
    <section className="border-t border-slate-200/60 bg-slate-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {t('landing.metricsSection.title')}
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            {t('landing.metricsSection.subtitle')}
          </p>
          <p className="mt-3 text-base text-slate-600">
            {t('landing.metricsSection.description')}
          </p>
        </div>
        <div className="mt-10 flex gap-4 overflow-x-auto snap-x snap-mandatory md:mt-12 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible">
          {cards.map(({ id, Icon, title, text }) => (
            <div
              key={id}
              className="min-w-[80%] snap-start rounded-lg border border-slate-200/60 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-slate-200/50 md:min-w-0"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <Icon className="h-6 w-6" strokeWidth={2} />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-slate-900">
                {title}
              </h3>
              <p className="mt-3 text-slate-600 text-sm">
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

