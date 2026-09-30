const fs = require('fs');
const path = 'research/src/pages/InterviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// The block to move
const progressBlock = `            <div className="mt-6">
              {(isUploadingAudio || isProcessingUpload) ? (
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
              ) : (
                <div className="research-transcript-container">
                  {segments.length > 0 ? (
                    <InterviewTranscript
                      segments={segments}
                      searchTerm={searchTerm}
                      onUpdateSegment={updateSegment}
                      t={t}
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/50 text-sm text-slate-400">
                      {t('research.transcriptEmpty')}
                    </div>
                  )}
                </div>
              )}
            </div>`;

// First, find the block in transcript tab and replace it just with the transcript logic
const oldTranscriptArea = `            <div className="mt-6">
              {(isUploadingAudio || isProcessingUpload) ? (`;
              
if (content.includes(oldTranscriptArea)) {
  // Extract and replace
  // ... let's use standard string manipulation to cut it out and put it into summary
}

