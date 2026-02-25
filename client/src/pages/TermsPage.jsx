import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import termsEn from '../content/terms.en';
import termsUk from '../content/terms.uk';

const termsContent = { en: termsEn, uk: termsUk };

function SectionBody({ body }) {
  const blocks = body.split(/\n\n+/);
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const lines = trimmed.split('\n').filter(Boolean);
        const isList = lines.some((l) => l.startsWith('•'));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-6 space-y-1.5 text-gray-700">
              {lines.map((line, j) => (
                <li key={j}>{line.replace(/^•\s*/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-gray-700 leading-relaxed whitespace-pre-line">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

const TermsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language === 'uk' ? 'uk' : 'en';
  const content = termsContent[lang] || termsContent.en;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-12">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={18} />
          {t('auth.termsBackToAuth')}
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-8 py-10 text-white">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <FileText size={24} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {t('auth.termsTitle')}
                </h1>
                <p className="text-orange-100 text-sm mt-0.5">
                  {t('auth.termsLastUpdated', { date: content.lastUpdated })}
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-10 sm:px-10 sm:py-12">
            <p className="text-gray-700 leading-relaxed mb-10">{content.intro}</p>

            <div className="space-y-10">
              {content.sections.map((section, idx) => (
                <section key={idx} className="scroll-mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
                    {section.title}
                  </h2>
                  <SectionBody body={section.body} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
