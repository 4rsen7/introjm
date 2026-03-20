import React from 'react';
import { useTranslation } from 'react-i18next';

const PORTRAIT_FORCES = [
  ['pushes', 'interviews.pushes', 'bg-amber-50 border-amber-100 text-amber-900'],
  ['pulls', 'interviews.pulls', 'bg-emerald-50 border-emerald-100 text-emerald-900'],
  ['anxieties', 'interviews.anxieties', 'bg-rose-50 border-rose-100 text-rose-900'],
  ['habits', 'interviews.habits', 'bg-slate-50 border-slate-200 text-slate-900'],
];

export default function PortraitDetailSections({ portraitData }) {
  const { t } = useTranslation();

  if (!portraitData) return null;

  return (
    <div className="space-y-6">
      {(portraitData.jobToBeDone || portraitData.progressMoment || portraitData.decisionStyle) ? (
        <div className="grid gap-4 md:grid-cols-3">
          {portraitData.jobToBeDone ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('interviews.jobToBeDone')}</div>
              <p className="text-sm text-gray-900 leading-relaxed">{portraitData.jobToBeDone}</p>
            </div>
          ) : null}
          {portraitData.progressMoment ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('personas.portraits.progressMoment')}</div>
              <p className="text-sm text-gray-900 leading-relaxed">{portraitData.progressMoment}</p>
            </div>
          ) : null}
          {portraitData.decisionStyle ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{t('personas.portraits.decisionStyle')}</div>
              <p className="text-sm text-gray-900 leading-relaxed">{portraitData.decisionStyle}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.forcesOfProgress')}</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {PORTRAIT_FORCES.map(([key, labelKey, tone]) => {
            const items = portraitData.forcesOfProgress?.[key] || [];
            return (
              <div key={key} className={`rounded-xl border p-4 shadow-sm space-y-2 ${tone}`}>
                <div className="text-xs font-bold uppercase tracking-wider">{t(labelKey)}</div>
                {items.length > 0 ? (
                  <ul className="space-y-1">
                    {items.map((item, index) => (
                      <li key={`${item}-${index}`} className="text-sm leading-relaxed">• {item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm opacity-70">{t('personas.portraits.noForceSignals')}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {(portraitData.personalityTraits?.length > 0 || portraitData.opportunityAngles?.length > 0 || portraitData.evidenceQuotes?.length > 0) ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {portraitData.personalityTraits?.length > 0 ? (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('personas.portraits.personalityTraits')}</h3>
              <ul className="space-y-1">
                {portraitData.personalityTraits.map((trait, index) => (
                  <li key={`${trait}-${index}`} className="text-sm text-gray-900 leading-relaxed">• {trait}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {portraitData.opportunityAngles?.length > 0 ? (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('personas.portraits.opportunityAngles')}</h3>
              <ul className="space-y-1">
                {portraitData.opportunityAngles.map((angle, index) => (
                  <li key={`${angle}-${index}`} className="text-sm text-gray-900 leading-relaxed">• {angle}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {portraitData.evidenceQuotes?.length > 0 ? (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('interviews.keyQuotes')}</h3>
              <div className="space-y-2">
                {portraitData.evidenceQuotes.map((quote, index) => (
                  <blockquote key={`${quote}-${index}`} className="rounded-r-lg border-l-4 border-blue-200 bg-blue-50/70 pl-4 py-2 text-sm italic text-gray-800">
                    "{quote}"
                  </blockquote>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
