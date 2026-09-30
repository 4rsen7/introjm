const fs = require('fs');
let code = fs.readFileSync('research/src/pages/StudyPage.jsx', 'utf8');

// The original tablist block
const oldTablistRegex = /<div role="tablist" aria-label=\{t\('research\.studyNavigation'\)\} className="flex max-w-full gap-1 mb-7 overflow-x-auto rounded-2xl border border-slate-200\/70 bg-white\/70 p-1\.5 scrollbar-none">[\s\S]*?<\/div>/;

// Replace the main wrapper to include the grid layout and vertical tabs
const newGridStart = `  return <div className="mx-auto max-w-[80rem] min-w-0">
    <Link to="/" className="research-back"><ArrowLeft size={16} />{t('research.studies')}</Link>
    {notice && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Check size={16} />{t(\`research.\${notice}\`)}</p>}
    <div className="grid lg:grid-cols-[240px_1fr] gap-8 xl:gap-12 items-start">
      <nav role="tablist" aria-label={t('research.studyNavigation')} className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 lg:sticky lg:top-8 scrollbar-none">
        {[["overview", BookOpen, 'studyContext'], ["interviews", ListChecks, 'interviews'], ["plan", ClipboardList, 'researchPlan'], ["results", Sparkles, 'taskComparison'], ["synthesis", Check, 'studyResults']].map(([id, Icon, label]) => (
          <button 
            key={id} 
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => navigate(\`#\${id}\`, { replace: true })}
            className={\`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition whitespace-nowrap \${activeTab === id ? 'bg-white shadow-sm text-slate-900 border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}\`}
          >
            <Icon size={18} className={activeTab === id ? 'text-orange-600' : 'text-slate-400'} />
            {t(\`research.\${label}\`)}
          </button>
        ))}
      </nav>
      <div className="space-y-7 min-w-0">`;

// We also need to close the grid
code = code.replace(/<Link to="\/" className="research-back">[\s\S]*?<\/div>\s*<div className="space-y-7">/, newGridStart);

// At the end of the return <div className="mx-auto max-w-5xl min-w-0"> we need to close the `<div className="grid...">` 
// Basically find `    </div>\n    {dialog === 'edit'` and replace with `      </div>\n    </div>\n    {dialog === 'edit'`
code = code.replace(/    <\/div>\n    \{dialog === 'edit'/, `      </div>\n    </div>\n    {dialog === 'edit'`);

// Replace max-w-5xl with max-w-[80rem] on the main container
code = code.replace(/className="mx-auto max-w-5xl min-w-0"/, `className="mx-auto max-w-[80rem] min-w-0"`);

// Let's remove the .research-tab css since we used tailwind classes directly for the new vertical tabs
fs.writeFileSync('research/src/pages/StudyPage.jsx', code);
