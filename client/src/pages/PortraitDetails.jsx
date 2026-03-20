import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, Sparkles, Trash2 } from 'lucide-react';
import Tooltip from '../components/common/Tooltip';
import PortraitDetailSections from '../components/personas/PortraitDetailSections';

const dominantForceLabel = (value, t) => {
  if (!value) return t('personas.portraits.dominantForces.unknown');
  return t(`personas.portraits.dominantForces.${value}`, { defaultValue: value });
};

export default function PortraitDetails({ portraits = [], currentUserId, isWorkspaceOwner, onDeletePortrait }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();

  const portrait = portraits.find((item) => String(item.id) === String(id));

  if (!portrait) {
    return (
      <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900">
        <div className="app-empty-state max-w-4xl mx-auto rounded-3xl px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-gray-900">{t('personas.portraits.notFoundTitle')}</h1>
          <p className="text-sm text-gray-500 mt-2">{t('personas.portraits.notFoundDesc')}</p>
          <button
            type="button"
            onClick={() => navigate('/personas?tab=portraits')}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={16} />
            {t('personas.portraits.backToList')}
          </button>
        </div>
      </div>
    );
  }

  const portraitData = portrait.portraitData || {};
  const canDelete = currentUserId != null && (portrait.user_id === currentUserId || isWorkspaceOwner);
  const sourceTitles = portrait.sourceInterviewTitles?.length > 0
    ? portrait.sourceInterviewTitles
    : (portrait.sourceInterviewTitle ? [portrait.sourceInterviewTitle] : []);

  const handleDelete = async () => {
    await onDeletePortrait?.(portrait.id);
    navigate('/personas?tab=portraits');
  };

  return (
    <div className="p-8 app-shell-bg min-h-screen font-sans text-gray-900">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/personas?tab=portraits')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={16} />
            {t('personas.portraits.backToList')}
          </button>
          {canDelete ? (
            <Tooltip content={t('common.delete')}>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
              >
                <Trash2 size={16} />
                {t('common.delete')}
              </button>
            </Tooltip>
          ) : null}
        </div>

        <section className="rounded-[2rem] overflow-hidden border border-slate-200 shadow-sm bg-white">
          <div className="px-8 py-8 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_35%),linear-gradient(135deg,_#f8fafc_0%,_#eef2ff_42%,_#f8fafc_100%)] border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 text-blue-700 border border-blue-100 text-xs font-semibold uppercase tracking-[0.18em]">
                <Sparkles size={12} />
                {portraitData.archetype || t('personas.portraits.generatedLabel')}
              </span>
              {portraitData.dominantForce ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-medium">
                  {t('personas.portraits.dominantForce')}: {dominantForceLabel(portraitData.dominantForce, t)}
                </span>
              ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                    {portrait.title || portraitData.title || t('personas.portraits.untitled')}
                  </h1>
                  {portraitData.summary ? (
                    <p className="mt-4 text-base leading-7 text-slate-700 max-w-3xl">{portraitData.summary}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span>{t('common.updated')}: {portrait.updatedAt}</span>
                  <span>{t('common.createdBy')}: {portrait.owner || t('common.unknown')}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/80 backdrop-blur p-5 space-y-4 shadow-sm">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{t('personas.portraits.sourceSet')}</div>
                  <div className="mt-3 space-y-2">
                    {sourceTitles.length > 0 ? sourceTitles.map((title, index) => (
                      <div key={`${title}-${index}`} className="inline-flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <Mic size={14} className="text-slate-400" />
                        <span className="truncate">{title}</span>
                      </div>
                    )) : (
                      <div className="text-sm text-slate-500">{t('personas.portraits.noSourceInterviews')}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <PortraitDetailSections portraitData={portraitData} />
          </div>
        </section>
      </div>
    </div>
  );
}
