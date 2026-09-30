const fs = require('fs');
const path = 'research/src/pages/InterviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Update setTab logic so it doesn't force 'transcript'
// Find:
// if (isProcessingUpload || (!summary && !hasTranscript)) {
//   setTab('transcript');
// }
const oldTabLogic = `    if (isProcessingUpload || (!summary && !hasTranscript)) {
      setTab('transcript');
    }`;
const newTabLogic = `    if (isProcessingUpload || summaryAnalysis?.busy) {
      setTab('summary');
    } else if (!summary && !hasTranscript) {
      setTab('transcript');
    }`;
content = content.replace(oldTabLogic, newTabLogic);

// 2. Change handleAudioFileUpload to set tab to summary
content = content.replace(`    setTab('transcript');
    setIsUploadingAudio(true);`, `    setTab('summary');
    setIsUploadingAudio(true);`);

// 3. Move the transcription progress block to summary tab
const transcriptionBlock = `              {(isUploadingAudio || isProcessingUpload) ? (
                <div className="flex flex-col items-center gap-4 py-8" data-testid="research-transcription-progress">
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
                </div>
              ) : `;

// In transcript tab, replace with empty
const transcriptReplacement = `              {`;
content = content.replace(transcriptionBlock, transcriptReplacement);

// Insert into summary tab
const summaryTabBlock = `          {summary ? <div className="research-summary">`;
const newSummaryTabBlock = `          {(isUploadingAudio || isProcessingUpload) ? (
            <div className="flex flex-col items-center gap-4 py-16" data-testid="research-transcription-progress">
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
            </div>
          ) : summaryAnalysis?.busy ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-blue-200/80 bg-gradient-to-b from-blue-50/50 to-white p-10 text-center shadow-sm my-8" data-testid="research-summary-progress">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-md ring-1 ring-blue-100">
                <Loader2 size={30} className="animate-spin" />
                <Sparkles size={14} className="absolute -right-1 -top-1 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">{t('research.generatingSummaryTitle')}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                {summaryStages[summaryStageIndex] || summaryStages[0]}
              </p>
            </div>
          ) : summary ? <div className="research-summary">`;

// Wait, the summary progress block is already there. Let's just prepend to it.
content = content.replace(summaryTabBlock, newSummaryTabBlock);

// Remove the old summary analysis block since I included it in the prepend? No, I need to remove the old one.
const oldSummaryBusyBlockStart = `          </div> : summaryAnalysis.busy ? (`;
const oldSummaryBusyBlockPattern = /          <\/div> : summaryAnalysis\.busy \? \([\s\S]*?              <\/div>\n            <\/div>\n          \) : <EmptyState/;

content = content.replace(oldSummaryBusyBlockPattern, `          </div> : <EmptyState`);

fs.writeFileSync(path, content);
console.log('patched progress tabs');
