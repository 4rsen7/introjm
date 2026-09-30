const fs = require('fs');

const ukPath = 'research/src/locales/uk.json';
let uk = JSON.parse(fs.readFileSync(ukPath, 'utf8'));
uk.impactTitle = "Оновлення висновків";
uk.impactHint = "План дослідження або транскрипт змінились після останньої генерації висновків. Перевірте, чи потрібне оновлення, щоб результати залишалися точними.";
uk.checkImpact = "Перевірити зміни";
fs.writeFileSync(ukPath, JSON.stringify(uk, null, 2) + '\n');

const enPath = 'research/src/locales/en.json';
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
en.impactTitle = "Update Summary";
en.impactHint = "The study plan or transcript has changed since the summary was last generated. Check if an update is needed to keep your results accurate.";
en.checkImpact = "Check changes";
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

console.log('patched impact strings');
