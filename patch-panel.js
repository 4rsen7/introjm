const fs = require('fs');
const path = 'research/src/components/StudyPlanPanel.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldBanner = `<div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
                <Sparkles size={14} />
                {t('research.planDraftBadge')}
              </div>
              <h3 className="mt-1.5 text-base font-bold text-slate-900">{t('research.planDraftFromInterviewTitle')}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t('research.planDraftFromInterviewBody')}</p>
            </div>`;

const newBanner = `<div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
                <Sparkles size={14} />
                {t('research.planDraftBadge')}
              </div>
              <h3 className="mt-1.5 text-base font-bold text-slate-900">
                {proposal && proposalIsCurrent ? t('research.planDraftReadyTitle') : t('research.planDraftFromInterviewTitle')}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {proposal && proposalIsCurrent ? t('research.planDraftReadyBody') : t('research.planDraftFromInterviewBody')}
              </p>
            </div>`;

if (content.includes(oldBanner)) {
  content = content.replace(oldBanner, newBanner);
  fs.writeFileSync(path, content);
  console.log('patched panel');
} else {
  console.log('could not find banner block');
}
