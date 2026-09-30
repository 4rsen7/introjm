const fs = require('fs');
const path = 'research/src/pages/InterviewPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove processingStageIndex from the pollTimer effect
content = content.replace(/setProcessingStageIndex\(1\);\n    const stageTimer = setTimeout\(\(\) => setProcessingStageIndex\(2\), 10000\);\n/g, '');
content = content.replace(/    if \(!isProcessingUpload && !isUploadingAudio\) \{\n      setProcessingStageIndex\(1\);\n      return undefined;\n    \}\n    if \(isUploadingAudio\) \{\n      setProcessingStageIndex\(0\);\n      return undefined;\n    \}\n/g, '');
content = content.replace(/      clearTimeout\(stageTimer\);\n/g, '');

// 2. Add stage timers to handleAudioFileUpload
const uploadCodeReplace = `    setIsUploadingAudio(true);
    setProcessingStageIndex(0);
    const stageTimer1 = setTimeout(() => setProcessingStageIndex(1), 3000);
    const stageTimer2 = setTimeout(() => setProcessingStageIndex(2), 12000);`;
content = content.replace(/    setIsUploadingAudio\(true\);/g, uploadCodeReplace);

// 3. Clear timers in handleAudioFileUpload finally
const finallyCodeReplace = `      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setIsUploadingAudio(false);`;
content = content.replace(/      setIsUploadingAudio\(false\);/g, finallyCodeReplace);

fs.writeFileSync(path, content);
console.log('patched');
