const fs = require('fs');
const path = 'research/src/pages/InterviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');

const oldUI = `                <div className="flex flex-col items-center justify-center rounded-3xl border border-orange-200/80 bg-gradient-to-b from-orange-50/60 to-white p-8 text-center shadow-sm" data-testid="research-transcription-progress">
                  <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-orange-600 shadow-md ring-1 ring-orange-100">
                    <Loader2 size={28} className="animate-spin" />
                    <Sparkles size={14} className="absolute -right-1 -top-1 text-orange-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{t('research.transcribingTitle')}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    {t('research.transcribingBody')}
                  </p>
                  {sourceUploadFileName && (
                    <p className="mt-2 text-xs font-medium text-slate-500">{sourceUploadFileName}</p>
                  )}
                  <div className="mt-6 w-full max-w-md space-y-2.5 text-left">
                    {uploadStages.map((label, idx) => {
                      const isDone = idx < processingStageIndex;
                      const isActive = idx === processingStageIndex;
                      return (
                        <div
                          key={label}
                          className={\`flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-semibold transition \${
                            isActive
                              ? 'border-orange-200 bg-orange-50/80 text-orange-950 shadow-xs'
                              : isDone
                                ? 'border-emerald-200/70 bg-emerald-50/50 text-emerald-900'
                                : 'border-slate-200/70 bg-white/70 text-slate-400'
                          }\`}
                        >
                          <span className={\`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold \${
                            isActive
                              ? 'bg-orange-600 text-white'
                              : isDone
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-400'
                          }\`}>
                            {isDone ? <Check size={13} /> : isActive ? <Loader2 size={13} className="animate-spin" /> : idx + 1}
                          </span>
                          <span className="flex-1">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>`;

const newUI = `                <div className="flex flex-col items-center gap-4 py-8" data-testid="research-transcription-progress">
                  <div className="relative flex items-center justify-center py-4">
                    <div className="absolute inset-0 bg-emerald-200 rounded-full blur-xl opacity-50 animate-pulse"></div>
                    <Loader2 size={64} strokeWidth={2.5} className="animate-spin text-emerald-500 relative z-10 mx-auto" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-gray-900 animate-pulse">
                      {isUploadingAudio ? (
                        <>
                          {processingStageIndex === 0 && t('interviews.uploadStage1', 'Завантаження у захищену хмару...')}
                          {processingStageIndex === 1 && t('interviews.uploadStage2', 'Аналіз аудіо...')}
                          {processingStageIndex === 2 && t('interviews.uploadStage3', 'Генерація структурованого тексту...')}
                        </>
                      ) : (
                        t('interviews.transcribing', 'Обробляємо транскрипт...')
                      )}
                    </h3>
                    <p className="text-gray-500 mt-2 transition-opacity duration-300">
                      {isUploadingAudio ? (
                        <>
                          {processingStageIndex === 0 && t('interviews.uploadStage1Desc', 'Безпечно передаємо ваш медіафайл на наші сервери для обробки.')}
                          {processingStageIndex === 1 && t('interviews.uploadStage2Desc', 'ШІ обробляє запис і готує структуру транскрипту.')}
                          {processingStageIndex === 2 && t('interviews.uploadStage3Desc', 'Завершуємо форматування тексту та часових міток. Майже готово!')}
                        </>
                      ) : (
                        t('interviews.transcribingDesc', 'Наш ШІ розпізнає мовлення та структурує текст. Це займе кілька хвилин.')
                      )}
                    </p>
                    {sourceUploadFileName && (
                      <p className="mt-4 text-xs font-medium text-slate-400">{sourceUploadFileName}</p>
                    )}
                  </div>
                </div>`;

if (content.includes(oldUI)) {
  content = content.replace(oldUI, newUI);
  fs.writeFileSync(path, content);
  console.log('patched UI');
} else {
  console.log('could not find old UI block');
}
